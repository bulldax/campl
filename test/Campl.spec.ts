require('module-alias/register');

import * as chai from 'chai';
import BN from 'bn.js';
import ChaiSetup from '@testUtils/chaiSetup';
import { getWeb3 } from '@testUtils/web3Helper';
import { Blockchain } from '@testUtils/blockchain';

import {
    AmplMockContract,
    AmplMockInstance,
    CamplContract,
    CamplInstance
} from '@gen/truffle-contracts';

import Web3 from 'web3';

import { e9, e18 } from '@testUtils/units';
import { ZERO, ONE, TWO, THREE, ONE_HUNDRED, ZERO_ADDRESS } from '@testUtils/constants';

import { expectRevert, constants } from '@openzeppelin/test-helpers';

import { Account, getSnapshot, Snapshot } from '@testUtils/snapshot';
import { bnSnapshotDiff, getBN } from '@testUtils/bnSnapshot';
import { getContractLogs, Log } from '@testUtils/printLogs';

const web3: Web3 = getWeb3();
const blockchain = new Blockchain(web3.currentProvider);

ChaiSetup.configure();

const { expect } = chai;

const amplMockContract: AmplMockContract = artifacts.require("AmplMock");
const camplContract: CamplContract = artifacts.require("Campl");

async function getAmplConstant(ampl: AmplMockInstance) {
    let msg = "";

    msg +=  "INITIAL_FRAGMENTS_SUPPLY: " + await ampl.INITIAL_FRAGMENTS_SUPPLY() + "\n";
    msg +=  "TOTAL_GONS: " + await ampl.TOTAL_GONS() + "\n";

    msg += "=======================\n";
    return msg;
}

async function getAmplStatus(ampl: AmplMockInstance) {
    let msg = "";

    msg += "_totalSupply: " + await ampl._totalSupply() + "\n";
    msg += "_gonsPerFragment: " + await ampl._gonsPerFragment() + "\n";
    return msg;
}

async function getLatestBlockNumber(): Promise<number> {
    return (await web3.eth.getBlock('latest')).number;
}

contract("Campl", ([deployer, user1, user2]) => {
    let campl: CamplInstance;
    let ampl: AmplMockInstance;
    const name = "Compatible AMPL";
    const symbol = "CAMPL";
    const decimal = new BN(18);

    const bigNum = e18(1).mul(e18(1)).mul(e18(1));
    function getName(account: string) {
        return (account == deployer) ? "deployer" : (account == user1) ? "user1" : "user2";
    }

    async function accountInfo(account: string, spender: string) {
        let msg = "== " + getName(account) + " , " + getName(spender) + " ==\n";
        msg += "_gonBalances: " + (await ampl._gonBalances(account)).toString() + "\n";
        msg += "balanceOf: " + (await ampl.balanceOf(account)).toString() + "\n";
        msg += "_allowedFragments: " + (await ampl._allowedFragments(account, spender)).toString() + "\n";
        msg += "allowance" + (await ampl.allowance(account, spender)).toString() + "\n";

        return msg;
    }

    function getTargetAccounts(): Account[] {
        return [
            { name: "campl", address: campl.address },
            { name: "deployer", address: deployer },
            { name: "user1", address: user1 },
            { name: "user2", address: user2 }
        ];
    }

    async function getAmplBalanceSnapshot() {
        return getSnapshot(getTargetAccounts(), async(_acc) => ampl.balanceOf(_acc.address));
    }

    async function getCamplBalanceSnapshot() {
        return getSnapshot(getTargetAccounts(), async(_acc) => campl.balanceOf(_acc.address));
    }

    async function getCamplUnderlyingBalanceSnapshot() {
        return getSnapshot(getTargetAccounts(), async(_acc) => campl.underlyingBalanceOf(_acc.address));
    }

    before(async () => {
        ampl = await amplMockContract.new({from: deployer});
        await ampl.initialize({from: deployer});

        console.log("totalSupply", (await ampl.totalSupply()).toString());
        console.log("balanceOf", (await ampl.balanceOf(deployer)).toString());

        await ampl.transfer(user1, e9(10000), {from: deployer});
        await ampl.transfer(user2, e9(10000), {from: deployer});

        console.log(await getAmplConstant(ampl));
        console.log(await getAmplStatus(ampl));

        campl = await camplContract.new(ampl.address, {from: deployer});
    });

    async function rebaseRandomly() {
        let supplyDelta = (await ampl.totalSupply()).div(
            (new BN(Math.round(Math.random() * 1000)).add(ONE)));
        if (Math.round(Math.random() * 1000) % 2 == 0) {
            supplyDelta = supplyDelta.neg();
        }

        await ampl.rebase(supplyDelta);
    }

    async function rebaseToTotalSupply(totalSupply: BN) {
        let supplyDelta = totalSupply.sub((await ampl.totalSupply()));

        await ampl.rebase(supplyDelta);
    }

    async function getCamplDiff(fn: () => Promise<void>): Promise<[Snapshot]> {
        const camplSnapShot1 = await getCamplBalanceSnapshot();

        await fn();

        const camplSnapShot2 = await getCamplBalanceSnapshot();

        const camplDiff = bnSnapshotDiff(camplSnapShot1, camplSnapShot2);
        return [camplDiff];
    }

    async function getDiffs(fn: () => Promise<void>): Promise<[Snapshot, Snapshot]> {
        const amplSnapShot1 = await getAmplBalanceSnapshot();
        const camplSnapShot1 = await getCamplBalanceSnapshot();

        await fn();

        const amplSnapShot2 = await getAmplBalanceSnapshot();
        const camplSnapShot2 = await getCamplBalanceSnapshot();

        const amplDiff = bnSnapshotDiff(amplSnapShot1, amplSnapShot2);
        const camplDiff = bnSnapshotDiff(camplSnapShot1, camplSnapShot2);
        return [amplDiff, camplDiff];
    }

    async function get3Diffs(fn: () => Promise<void>): Promise<[Snapshot, Snapshot, Snapshot]> {
        const camplSnapShot1 = await getCamplUnderlyingBalanceSnapshot();
        let [diff1, diff2] = await getDiffs(fn);
        const camplSnapShot2 = await getCamplUnderlyingBalanceSnapshot();

        const diff3 = bnSnapshotDiff(camplSnapShot1, camplSnapShot2);
        return [diff1, diff2, diff3];
    }

    async function issueIn(underlyingAmount: BN, account: string) {
        const derivativeAmount = await campl.toDerivativeForIssue(underlyingAmount);

        const [amplDiff, camplDiff] = await getDiffs(async () => {
            await ampl.approve(campl.address, underlyingAmount, {from: account});
            await campl.issueIn(account, underlyingAmount, { from: account });
        });

        expect(getBN(amplDiff, account)).to.be.bignumber.eq(underlyingAmount.neg());
        expect(getBN(amplDiff, campl.address)).to.be.bignumber.eq(underlyingAmount);

        expect(getBN(camplDiff, account)).to.be.bignumber.eq(derivativeAmount);
    }

    async function issue(derivativeAmount: BN, account: string) {
        const underlyingAmount = await campl.toUnderlyingForIssue(derivativeAmount);

        const [amplDiff, camplDiff] = await getDiffs(async () => {
            await ampl.approve(campl.address, underlyingAmount, {from: account});
            await campl.issue(account, derivativeAmount, { from: account });
        });

        expect(getBN(amplDiff, account)).to.be.bignumber.eq(underlyingAmount.neg());
        expect(getBN(amplDiff, campl.address)).to.be.bignumber.eq(underlyingAmount);

        expect(getBN(camplDiff, account)).to.be.bignumber.eq(derivativeAmount);
    }

    async function issueRandomly(account: string) {
        const underlyingAmount = new BN(Math.round(Math.random() * 1e9));
        await issueIn(underlyingAmount, account);
    }

    async function reclaimAll(account: string, expectedAmplBalance: BN) {
        await reclaim(await campl.balanceOf(account), account);
    }

    async function reclaim(derivativeAmount: BN, account: string) {
        const underlyingAmount = await campl.toUnderlyingForReclaim(derivativeAmount);
        const [amplDiff, camplDiff] = await getDiffs(async () => {
            await campl.reclaim(account, derivativeAmount, {from: account});
        });

        expect(getBN(camplDiff, account)).to.be.bignumber.eq(derivativeAmount.neg());
        expect(getBN(amplDiff, campl.address)).to.be.bignumber.eq(underlyingAmount.neg());
        expect(getBN(amplDiff, account)).to.be.bignumber.eq(underlyingAmount);
    }

    function randomLessThan(num: BN): BN {

        let denomStr = "1" + num.toString().substr(num.toString().length/2);
        let denom = new BN(denomStr);

        const balanceNumber = Number(num.div(denom).toString());

        let amount = new BN(Math.round(Math.random() * balanceNumber));
        amount = amount.sub(ONE);
        amount = amount.mul(denom);
        amount = amount.add(new BN(Math.round(Math.random() * Number(denom.toString()))));

        expect(amount).to.be.bignumber.lte(num);
        return amount;
    }

    async function reclaimRandomly(account: string) {
        const balance = await campl.balanceOf(account);
        const amount = randomLessThan(balance);

        await reclaim(amount, account);
    }

    async function sumAmpl(accounts: string[]) {
        let promiseList: Promise<BN>[] = [];

        for(let i=0; i < accounts.length; i++) {
            let account = accounts[i];
            promiseList.push(ampl.balanceOf(account));
        }

        let balances: BN[] = await Promise.all(promiseList);

        return balances.reduce((a:BN,b:BN) => a.add(b), ZERO);
    }

    async function sumCamplUnderlyingBalances(accounts: string[]) {
        let promiseList: Promise<BN>[] = [];

        for(let i=0; i < accounts.length; i++) {
            let account = accounts[i];
            promiseList.push(campl.underlyingBalanceOf(account));
        }

        let balances: BN[] = await Promise.all(promiseList);

        return balances.reduce((a:BN,b:BN) => a.add(b), ZERO);
    }

    async function sumAmplAndCamplUnderlying(accounts: string[]) {
        return (await sumAmpl(accounts)).add(await sumCamplUnderlyingBalances(accounts));
    }

    function getPercentOf(num: BN, percent: BN) : BN {
        return num.mul(percent).div(ONE_HUNDRED);
    }

    function checkLogWhenIssue(logs: Log, from: string, to: string, camplAmount: BN, amplAmount: BN) {
        expect(logs.length).to.be.eq(2);

        let mintHelperAddress = "";
        for(let i = 0; i < logs.length; i++) {
            let log = logs[i];
            switch(log.event) {
                case "Issue": {
                    expect(log.args['operator']).to.be.eq(from);
                    expect(log.args['from']).to.be.eq(from);
                    expect(log.args['to']).to.be.eq(to);
                    expect(log.args['derivativeAmount']).to.be.bignumber.eq(camplAmount);
                    expect(log.args['underlyingAmount']).to.be.bignumber.eq(amplAmount);
                    break;
                }
                case "Reclaim": {
                    assert.fail();
                    break;
                }
                case "Move": {
                    if (log.args['from'] == ZERO_ADDRESS) {
                        expect(log.args['operator']).to.be.eq(from);
                        mintHelperAddress = log.args['to'];
                        expect(log.args['derivativeAmount']).to.be.bignumber.eq(camplAmount);
                        expect(log.args['underlyingAmount']).to.be.bignumber.gte(amplAmount.sub(ONE)).lte(amplAmount);
                    } else {
                        expect(log.args['operator']).to.be.eq(mintHelperAddress);
                        expect(log.args['from']).to.be.eq(mintHelperAddress);
                        expect(log.args['to']).to.be.eq(to);
                        expect(log.args['derivativeAmount']).to.be.bignumber.eq(camplAmount);
                        expect(log.args['underlyingAmount']).to.be.bignumber.gte(amplAmount.sub(ONE)).lte(amplAmount);
                    }
                    break;
                }
            }
        }
    }

    function checkLogWhenReclaim(logs: Log, from: string, to: string, camplAmount: BN, amplAmount: BN) {
        expect(logs.length).to.be.eq(2);

        for(let i = 0; i < logs.length; i++) {
            let log = logs[i];
            switch(log.event) {
                case "Issue": {
                    assert.fail();
                    break;
                }
                case "Reclaim": {
                    expect(log.args['operator']).to.be.eq(from);
                    expect(log.args['from']).to.be.eq(from);
                    expect(log.args['to']).to.be.eq(to);
                    expect(log.args['derivativeAmount']).to.be.bignumber.eq(camplAmount);
                    expect(log.args['underlyingAmount']).to.be.bignumber.eq(amplAmount);
                    break;
                }
                case "Move": {
                    expect(log.args['operator']).to.be.eq(from);
                    expect(log.args['from']).to.be.eq(from);
                    expect(log.args['to']).to.be.eq(ZERO_ADDRESS);
                    expect(log.args['derivativeAmount']).to.be.bignumber.eq(camplAmount);
                    expect(log.args['underlyingAmount']).to.be.bignumber.gte(amplAmount.sub(ONE)).lte(amplAmount);
                    break;
                }
            }
        }
    }

    function checkMoveLog(logs: Log, operator: string, from: string, to: string, camplAmount: BN, amplAmount: BN) {
        expect(logs.length).to.be.eq(1);

        const log = logs[0];

        expect(log.event).to.be.eq("Move")

        expect(log.args['operator']).to.be.eq(operator);
        expect(log.args['from']).to.be.eq(from);
        expect(log.args['to']).to.be.eq(to);
        expect(log.args['derivativeAmount']).to.be.bignumber.eq(camplAmount);
        expect(log.args['underlyingAmount']).to.be.bignumber.eq(amplAmount);
    }

    describe("AmplMock", async () => {
        describe("rebase", async () => {
            beforeEach(async () => {
                await blockchain.saveSnapshotAsync();
            });

            afterEach(async () => {
                await blockchain.revertAsync();
            });

            it("rebase can make 1 error to each account", async () => {
                const initialTotalSupply = await ampl.totalSupply();
                await ampl.transfer(user1, new BN("229306981"), {from: deployer});
                await ampl.transfer(user2, new BN("1220383723"), {from: deployer});

                const errors = [0,0,0,0];
                for(let i=0; i < 10; i++) {
                    await rebaseRandomly();
                    let diff = (await ampl.totalSupply()).sub(await sumAmpl([deployer, user1, user2]));
                    // error is not cumulated
                    errors[Number(diff.toString())]++;
                }
                expect(errors[1]+errors[2]+errors[3]).to.be.gt(errors[0]);

                await rebaseToTotalSupply(initialTotalSupply);
                // when totalSupply back to initial, errors are disappeared
                expect(await sumAmpl([deployer, user1, user2])).to.be.bignumber.eq(await ampl.totalSupply());
            });

            it("approve is not changed after rebase", async () => {
                const amount = e9(999);
                await ampl.approve(deployer, amount, {from: user1});
                expect(await ampl.allowance(user1, deployer)).to.be.bignumber.eq(amount);

                await rebaseRandomly();
                expect(await ampl.allowance(user1, deployer)).to.be.bignumber.eq(amount);
            });
        });
    });

    describe("Campl", async () => {
        describe("ERC20 test", async () => {
            it("name, symbol, decimals, totalSupply, balanceOf", async () => {
                expect(await campl.name()).to.be.eq(name);
                expect(await campl.symbol()).to.be.eq(symbol);
                expect(await campl.decimals()).to.be.bignumber.eq(decimal);

                expect(await campl.totalSupply()).to.be.bignumber.eq(ZERO);
                expect(await campl.balanceOf(deployer)).to.be.bignumber.eq(ZERO);
            });

            it('mint & burn should be undefined', async () => {
                expect((campl as any).mint).to.be.undefined;
                expect((campl as any)._mint).to.be.undefined;
                expect((campl as any).burn).to.be.undefined;
                expect((campl as any)._burn).to.be.undefined;
            });

            describe('transfer', async () => {
                let user1InitialCampl = e18(100000);

                before(async () => {
                    await blockchain.saveSnapshotAsync();
                    await ampl.approve(campl.address, constants.MAX_UINT256, {from: deployer});
                    await campl.issue(user1, user1InitialCampl, {from: deployer});
                });

                after(async () => {
                    await blockchain.revertAsync();
                });

                beforeEach(async () => {
                    await blockchain.saveSnapshotAsync();
                });

                afterEach(async () => {
                    await blockchain.revertAsync();
                });

                it ('should transfer token correctly', async () => {
                    const [diff] = await getCamplDiff(async () => {
                        await campl.transfer(user2, ONE, {from: user1});
                    });

                    expect(getBN(diff, user1)).to.be.bignumber.eq(ONE.neg());
                    expect(getBN(diff, user2)).to.be.bignumber.eq(ONE);
                });

                it ('should NOT transfer token more than balance', async () => {
                    await expectRevert(
                        campl.transfer(user2, user1InitialCampl.add(ONE), {from: user1}),
                        "ERC20: transfer amount exceeds balance"
                    );

                    await expectRevert(
                        campl.transfer(user2, constants.MAX_UINT256, {from: user1}),
                        "SafeMath: multiplication overflow"
                    );
                });

                it('should transfer from approved user', async () =>{
                    await campl.approve(deployer, ONE, {from: user1});
                    expect(await campl.allowance(user1, deployer, {from: user1})).to.be.bignumber.equal(ONE);

                    const [diff] = await getCamplDiff(async () => {
                        await campl.transferFrom(user1, user2, ONE, {from: deployer});
                    });

                    expect(await campl.allowance(user1, deployer)).to.be.bignumber.equal(ZERO);

                    expect(getBN(diff, user1)).to.be.bignumber.eq(ONE.neg());
                    expect(getBN(diff, user2)).to.be.bignumber.eq(ONE);
                });

                it('should NOT transfer from approved user more than allowances', async () =>{
                    await campl.approve(deployer, ONE, {from: user1});
                    expect(await campl.allowance(user1, deployer, {from: user1})).to.be.bignumber.equal(ONE);

                    await expectRevert(
                        campl.transferFrom(user1, user2, TWO, {from: deployer}),
                        "ERC20: transfer amount exceeds allowance"
                    );

                    await expectRevert(
                        campl.transferFrom(user1, user2, constants.MAX_UINT256, {from: deployer}),
                        "SafeMath: multiplication overflow"
                    );
                    expect(await campl.allowance(user1, deployer, {from: user1})).to.be.bignumber.equal(ONE);
                });
            });
        });

        describe("reclaimed Ampl value", async () => {
            beforeEach(async () => {
                await blockchain.saveSnapshotAsync();
            });

            afterEach(async () => {
                await blockchain.revertAsync();
            });

            async function issueAndRebase(account: string, issueAmplAmount: BN, rebaseRatioPercent: BN) {
                if (issueAmplAmount.gt(ZERO)) {
                    await issueIn(issueAmplAmount, account);
                }

                const prevUnderlying = await campl.underlyingBalanceOf(account);
                const rebaseDelta = getPercentOf(await ampl.totalSupply(), rebaseRatioPercent)
                    .sub(await ampl.totalSupply());
                await ampl.rebase(rebaseDelta, {from: deployer});

                expect(await campl.underlyingBalanceOf(account)).to.be.bignumber
                    .eq(getPercentOf(prevUnderlying, rebaseRatioPercent));
            }

            it("get x2 Ampl after rebased x2", async () => {
                const amplAmount = randomLessThan(e9(10));

                await issueAndRebase(user1, amplAmount, new BN("200"));
            });

            it("get 1/2 Ampl after rebased 1/2", async () => {
                const amplAmount = randomLessThan(e9(10));

                await issueAndRebase(user1, amplAmount, new BN("50"));
            });

            it("get same Ampl (with error) after rebased 1/2 and x2", async () => {
                const amplAmount = randomLessThan(e9(10));

                await issueAndRebase(user1, amplAmount, new BN("50"));

                const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("200"))
                    .sub(await ampl.totalSupply());
                await ampl.rebase(rebaseDelta, {from: deployer});

                expect(await campl.underlyingBalanceOf(user1)).to.be.bignumber.eq(amplAmount);
            });

            it("2 accounts scenario", async () => {
                const amplAmount1 = e9(10);
                await issueAndRebase(user1, amplAmount1, new BN("50"));

                const amplAmount2 = e9(5);
                await issueAndRebase(user2, amplAmount2, new BN("50"));

                expect(await campl.balanceOf(user1)).to.be.bignumber
                    .eq(await campl.balanceOf(user2));

                const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("400"))
                    .sub(await ampl.totalSupply());
                await ampl.rebase(rebaseDelta, {from: deployer});

                expect(await campl.balanceOf(user1)).to.be.bignumber
                    .eq(await campl.balanceOf(user2));

                await reclaimAll(user1, e9(10));
                await reclaimAll(user2, e9(10));

                expect(await campl.balanceOf(user1)).to.be.bignumber.eq(ZERO);
                expect(await campl.balanceOf(user2)).to.be.bignumber.eq(ZERO);
            });
        });

        describe("Ampl value integrity test", async () => {
            let accounts: string[] = [];
            let accounts2: string[] = [];
            before(async () => {
                accounts = [deployer, user1, user2];
                accounts2 = [campl.address, deployer, user1, user2];
            });

            beforeEach(async () => {
                await blockchain.saveSnapshotAsync();
                expect(await campl.totalSupply()).to.be.bignumber.eq(ZERO);
            });

            afterEach(async () => {
                await blockchain.revertAsync();
            });

            async function issueAndReclaimTest(account: string, issueReclaimError: number) {
                const amplTotalSupply = await ampl.totalSupply();

                await issueRandomly(user1);
                await reclaimRandomly(user1);

                expect(await sumAmpl(accounts2)).to.be.bignumber.eq(amplTotalSupply);
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber
                    .lte(amplTotalSupply)
                    .gte(amplTotalSupply.sub(new BN(issueReclaimError)));
            }

            async function issueRebaseReclaimTest(account: string, issueReclaimError: number) {
                await issueRandomly(account);
                await rebaseRandomly();
                await reclaimRandomly(account);

                const amplTotalSupply = await ampl.totalSupply();
                // error by rebase. it could be maxium account len.
                expect(await sumAmpl(accounts2)).to.be.bignumber
                    .lte(amplTotalSupply)
                    .gte(amplTotalSupply.sub(new BN(accounts2.length)));

                // cumulatrated issue, reclaim errors + rebase error
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber
                    .lte(amplTotalSupply)
                    .gte(amplTotalSupply.sub(new BN(issueReclaimError + accounts2.length)));
            }

            it("simple issue & reclaim", async () => {
                await issueAndReclaimTest(user1, 1);
            });

            it("[issue, reclaim]x10", async () => {
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber.eq(await ampl.totalSupply());
                for(let i=0; i < 10; i++) {
                    // cumulated issue, reclaim errors are remains in campl
                    await issueAndReclaimTest(user1, i+1);
                }
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber.not.eq(await ampl.totalSupply());
            });

            it("simple issue, rebase & reclaim", async () => {
                await issueRebaseReclaimTest(user1, 1);
            });

            it("[issue, rebase, reclaim]x10", async () => {
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber.eq(await ampl.totalSupply());
                for(let i=0; i < 10; i++) {
                    await issueRebaseReclaimTest(user1, i+1);
                }
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber.not.eq(await ampl.totalSupply());
            });

            it("[issue, rebase, reclaim]x10, rebase back to initial", async () => {
                const totalSupply = await ampl.totalSupply();
                expect(await sumAmpl(accounts2)).to.be.bignumber.eq(totalSupply);

                const loopCount = 10;
                for(let i=0; i < loopCount; i++) {
                    await issueRebaseReclaimTest(user1, i+1);
                }

                await rebaseToTotalSupply(totalSupply);
                // error by transfer between user1, campl during rebase
                expect(await sumAmpl(accounts2)).to.be.bignumber
                    .lte(totalSupply)
                    .gte(totalSupply.sub(new BN(2)));
                //
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber
                    .lte(totalSupply)
                    .gte(totalSupply.sub(new BN(loopCount+1)));
            });

            it("multiple accounts [issue, rebase, reclaim]x10", async () => {
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber.eq(await ampl.totalSupply());
                for(let i=0; i < 10; i++) {
                    await issueRebaseReclaimTest(user1, i*2+1);
                    await issueRebaseReclaimTest(user2, i*2+2);
                }
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber.not.eq(await ampl.totalSupply());
            });

            it("multiple accounts [issue, rebase, reclaim]x10, rebase back to initial", async () => {
                const totalSupply = await ampl.totalSupply();
                expect(await sumAmpl(accounts2)).to.be.bignumber.eq(totalSupply);

                const loopCount = 10;
                for(let i=0; i < loopCount; i++) {
                    await issueRebaseReclaimTest(user1, i*2+1);
                    await issueRebaseReclaimTest(user2, i*2+1);
                }

                await rebaseToTotalSupply(totalSupply);
                expect(await sumAmpl(accounts2)).to.be.bignumber
                    .lte(totalSupply)
                    .gte(totalSupply.sub(new BN(3)));
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber
                    .lte(totalSupply)
                    .gte(totalSupply.sub(new BN(loopCount*2+1)));
            });
        });

        describe("Current totalSupply testing", async () => {
            beforeEach(async () => {
                await blockchain.saveSnapshotAsync();
                await rebaseToTotalSupply(new BN("139076241299642019"));
            });

            afterEach(async () => {
                await blockchain.revertAsync();
            });

            it("test", async () => {
                const underlyingAmount = e9(50);
                const expectCamplAmount = new BN("35951503673639114628");
                await issueIn(underlyingAmount, deployer);
                expect(await campl.balanceOf(deployer)).to.be.bignumber.eq(expectCamplAmount);
            });
        });

        describe("IDerivativeToken test", async () => {
            beforeEach(async () => {
                await blockchain.saveSnapshotAsync();
            });

            afterEach(async () => {
                await blockchain.revertAsync();
            });

            describe("basic views", async () => {
                it("name, symbol, decimals, totalSupply, balanceOf, underlying", async () => {
                    expect(await campl.name()).to.be.eq(name);
                    expect(await campl.symbol()).to.be.eq(symbol);
                    expect(await campl.decimals()).to.be.bignumber.eq(decimal);

                    expect(await campl.totalSupply()).to.be.bignumber.eq(ZERO);
                    expect(await campl.balanceOf(deployer)).to.be.bignumber.eq(ZERO);

                    expect(await campl.underlying()).to.be.eq(ampl.address);
                });
            });

            describe("events", async () => {
                const targetEvents = ["Issue", "Move", "Reclaim"];

                async function issueTest(from: string, to: string) {
                    const camplAmount = e18(10);
                    const amplAmount = await campl.toUnderlyingForIssue(camplAmount);

                    await ampl.approve(campl.address, amplAmount, {from: from});
                    await campl.issue(to, camplAmount, {from: from});

                    const logs = await getContractLogs(campl, targetEvents, await getLatestBlockNumber());
                    checkLogWhenIssue(logs, from, to, camplAmount, amplAmount);
                }

                async function issueInTest(from: string, to: string) {
                    const amplAmount = e9(10);
                    const camplAmount = await campl.toDerivativeForIssue(amplAmount);

                    await ampl.approve(campl.address, amplAmount, {from: from});
                    await campl.issueIn(to, amplAmount, {from: from});

                    const logs = await getContractLogs(campl, targetEvents, await getLatestBlockNumber());
                    checkLogWhenIssue(logs, from, to, camplAmount, amplAmount);
                }

                async function reclaimTest(from: string, to: string) {
                    const camplAmount = e18(10);
                    const amplAmount = await campl.toUnderlyingForIssue(camplAmount);

                    await ampl.approve(campl.address, amplAmount, {from: from});
                    await campl.issue(from, camplAmount, {from: from});

                    await campl.reclaim(to, camplAmount, {from: from});
                    const logs = await getContractLogs(campl, targetEvents, await getLatestBlockNumber());
                    checkLogWhenReclaim(logs, from, to, camplAmount, amplAmount);
                }

                async function reclaimInTest(from: string, to: string) {
                    const camplAmount = e18(10);
                    const amplAmount = await campl.toUnderlyingForIssue(camplAmount);

                    await ampl.approve(campl.address, amplAmount, {from: from});
                    await campl.issue(from, camplAmount, {from: from});

                    await campl.reclaimIn(to, amplAmount, {from: from});
                    const logs = await getContractLogs(campl, targetEvents, await getLatestBlockNumber());
                    checkLogWhenReclaim(logs, from, to, camplAmount, amplAmount);
                }

                it("Issue & Move emitted when issue to myself", async () => {
                    await issueTest(user1, user1);
                });

                it("Issue & Move emitted when issue to other", async () => {
                    await issueTest(user1, user2);
                });

                it("Issue & Move emitted when issueIn to myself", async () => {
                    await issueInTest(user1, user1);
                });

                it("Issue & Move emitted when issueIn to other", async () => {
                    await issueInTest(user1, user2);
                });

                it("Reclaim & Move emitted when reclaim to myself", async () => {
                    await reclaimTest(user1, user1);
                });

                it("Reclaim & Move emitted when reclaim to other", async () => {
                    await reclaimTest(user1, user2);
                });

                it("Reclaim & Move emitted when reclaimIn to myself", async () => {
                    await reclaimInTest(user1, user1);
                });

                it("Reclaim & Move emitted when reclaimIn to other", async () => {
                    await reclaimInTest(user1, user2);
                });

                it("Move emitted when transfer", async () => {
                    const issueAmount = e18(10);

                    await ampl.approve(campl.address, bigNum, {from: user1});
                    await campl.issue(user1, issueAmount, {from: user1});

                    const amount = e18(7);
                    const amplAmount = await campl.toUnderlyingForIssue(amount);
                    await campl.transfer(user2, amount, {from: user1});

                    const logs = await getContractLogs(campl, targetEvents, await getLatestBlockNumber());
                    await checkMoveLog(logs, user1, user1, user2, amount, amplAmount);
                });

                it("Move emitted when transferFrom", async () => {
                    const issueAmount = e18(10);

                    await ampl.approve(campl.address, bigNum, {from: user1});
                    await campl.issue(user1, issueAmount, {from: user1});

                    const amount = e18(7);
                    const amplAmount = await campl.toUnderlyingForIssue(amount);

                    await campl.approve(deployer, amount, {from: user1});
                    await campl.transferFrom(user1, user2, amount, {from: deployer});

                    const logs = await getContractLogs(campl, targetEvents, await getLatestBlockNumber());
                    await checkMoveLog(logs, deployer, user1, user2, amount, amplAmount);
                });
            });

            describe("exchange view", async () => {
                it("zero", async () => {
                    expect(await campl.toUnderlyingForIssue(ZERO)).to.be.bignumber.eq(ZERO);
                    expect(await campl.toDerivativeForIssue(ZERO)).to.be.bignumber.eq(ZERO);
                    expect(await campl.toUnderlyingForReclaim(ZERO)).to.be.bignumber.eq(ZERO);
                    expect(await campl.toDerivativeForReclaim(ZERO)).to.be.bignumber.eq(ZERO);
                });

                it("small number", async () => {
                    expect(await campl.toUnderlyingForIssue(ONE)).to.be.bignumber.eq(ONE);
                    expect(await campl.toUnderlyingForReclaim(ONE)).to.be.bignumber.eq(new BN("0"));
                    expect(await campl.toDerivativeForIssue(ONE)).to.be.bignumber.eq(new BN("2000000000"));
                    expect(await campl.toDerivativeForReclaim(ONE)).to.be.bignumber.eq(new BN("2000000000"));

                    expect(await campl.toUnderlyingForIssue(TWO)).to.be.bignumber.eq(new BN("1"));
                    expect(await campl.toUnderlyingForReclaim(TWO)).to.be.bignumber.eq(new BN("0"));
                    expect(await campl.toDerivativeForIssue(TWO)).to.be.bignumber.eq(new BN("4000000000"));
                    expect(await campl.toDerivativeForReclaim(TWO)).to.be.bignumber.eq(new BN("4000000000"));

                    expect(await campl.toUnderlyingForIssue(new BN(10))).to.be.bignumber.eq(new BN("1"));
                    expect(await campl.toUnderlyingForReclaim(new BN(10))).to.be.bignumber.eq(new BN("0"));
                    expect(await campl.toDerivativeForIssue(new BN(10))).to.be.bignumber.eq(new BN("20000000000"));
                    expect(await campl.toDerivativeForReclaim(new BN(10))).to.be.bignumber.eq(new BN("20000000000"));

                    expect(await campl.toUnderlyingForIssue(new BN(100))).to.be.bignumber.eq(new BN("1"));
                    expect(await campl.toUnderlyingForReclaim(new BN(100))).to.be.bignumber.eq(new BN("0"));
                    expect(await campl.toDerivativeForIssue(new BN(100))).to.be.bignumber.eq(new BN("200000000000"));
                    expect(await campl.toDerivativeForReclaim(new BN(100))).to.be.bignumber.eq(new BN("200000000000"));
                });

                it("constants.MAX_UINT256", async () => {
                    await expectRevert(campl.toUnderlyingForIssue(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                    await expectRevert(campl.toDerivativeForIssue(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                    await expectRevert(campl.toUnderlyingForReclaim(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                    await expectRevert(campl.toDerivativeForReclaim(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                });

                it("toUnderlyingForIssue possible large amount", async () => {
                    let camplAmount = "1000000000000000000000000000000000000000000000000000000000000"; // 1e60
                    let expectAmount = "500000000000000000000000000000000000000000000000000"; // 5 x 1e50
                    expect(await campl.toUnderlyingForIssue(new BN(camplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                    await expectRevert(campl.toUnderlyingForIssue(new BN(camplAmount + "0")), "SafeMath: multiplication overflow");
                });

                it("toUnderlyingForReclaim possible large amount", async () => {
                    let camplAmount = "1000000000000000000000000000000000000000000000000000000000000"; // 1e60
                    let expectAmount = "500000000000000000000000000000000000000000000000000"; // 5 x 1e50
                    expect(await campl.toUnderlyingForReclaim(new BN(camplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                    await expectRevert(campl.toUnderlyingForReclaim(new BN(camplAmount + "0")), "SafeMath: multiplication overflow");
                });

                it("toDerivativeForIssue possible large amount", async () => {
                    let amplAmount = "1000000000000000000000000000000000000000000000000000"; // 1e51
                    let expectAmount = "2000000000000000000000000000000000000000000000000000000000000"; // 2 x 1e60
                    expect(await campl.toDerivativeForIssue(new BN(amplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                    await expectRevert(campl.toDerivativeForIssue(new BN(amplAmount + "0")), "SafeMath: multiplication overflow");
                });

                it("toDerivativeForReclaim possible large amount", async () => {
                    let amplAmount = "1000000000000000000000000000000000000000000000000000"; // 1e51
                    let expectAmount = "2000000000000000000000000000000000000000000000000000000000000"; // 2 x 1e60
                    expect(await campl.toDerivativeForReclaim(new BN(amplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                    await expectRevert(campl.toDerivativeForReclaim(new BN(amplAmount + "0")), "SafeMath: multiplication overflow");
                });

                it("toUnderlyingForIssue & rebase", async () => {
                    const camplAmount = e18(1);
                    const amplAmount = e9(0.5);
                    expect(await campl.toUnderlyingForIssue(camplAmount)).to.be.bignumber.eq(amplAmount);

                    const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                    await ampl.rebase(rebaseDelta, {from: deployer});
                    expect(await campl.toUnderlyingForIssue(camplAmount)).to.be.bignumber.eq(getPercentOf(amplAmount, new BN("50")));
                });

                it("toDerivativeForIssue & rebase", async () => {
                    const amplAmount = e9(1);
                    const camplAmount = e18(2);
                    expect(await campl.toDerivativeForIssue(amplAmount)).to.be.bignumber.eq(camplAmount);

                    const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                    await ampl.rebase(rebaseDelta, {from: deployer});
                    expect(await campl.toDerivativeForIssue(amplAmount)).to.be.bignumber.eq(getPercentOf(camplAmount, new BN("200")));
                });

                it("toUnderlyingForReclaim & rebase", async () => {
                    const camplAmount = e18(1);
                    const amplAmount = e9(0.5);
                    expect(await campl.toUnderlyingForReclaim(camplAmount)).to.be.bignumber.eq(amplAmount);

                    const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                    await ampl.rebase(rebaseDelta, {from: deployer});
                    expect(await campl.toUnderlyingForIssue(camplAmount)).to.be.bignumber.eq(getPercentOf(amplAmount, new BN("50")));
                });

                it("toDerivativeForReclaim & rebase", async () => {
                    const amplAmount = e9(1);
                    const camplAmount = e18(2);
                    expect(await campl.toDerivativeForReclaim(amplAmount)).to.be.bignumber.eq(camplAmount);

                    const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                    await ampl.rebase(rebaseDelta, {from: deployer});
                    expect(await campl.toDerivativeForIssue(amplAmount)).to.be.bignumber.eq(getPercentOf(camplAmount, new BN("200")));
                });

                it("toUnderlyingForIssue & toDerivativeForIssue", async () => {
                    const camplAmount = e18(1);
                    expect(await campl.toDerivativeForIssue(
                        await campl.toUnderlyingForIssue(camplAmount))).to.be.bignumber.eq(camplAmount);
                });

                it("toDerivativeForIssue & toUnderlyingForIssue", async () => {
                    const amplAmount = e9(1);
                    expect(await campl.toUnderlyingForIssue(
                        await campl.toDerivativeForIssue(amplAmount))).to.be.bignumber.eq(amplAmount);
                });

                it("toUnderlyingForReclaim & toDerivativeForReclaim", async () => {
                    const camplAmount = e18(1);
                    expect(await campl.toDerivativeForReclaim(
                        await campl.toUnderlyingForReclaim(camplAmount))).to.be.bignumber.eq(camplAmount);
                });

                it("toDerivativeForReclaim & toUnderlyingForReclaim", async () => {
                    const amplAmount = e9(1);
                    expect(await campl.toUnderlyingForReclaim(
                        await campl.toDerivativeForReclaim(amplAmount))).to.be.bignumber.eq(amplAmount);
                });

                it("toUnderlyingForIssue & toDerivativeForReclaim", async () => {
                    const camplAmount = e18(1);
                    expect(await campl.toDerivativeForReclaim(
                        await campl.toUnderlyingForIssue(camplAmount))).to.be.bignumber.eq(camplAmount);
                });

                it("toDerivativeForIssue & toUnderlyingForReclaim", async () => {
                    const amplAmount = e9(1);
                    expect(await campl.toUnderlyingForReclaim(
                        await campl.toDerivativeForIssue(amplAmount))).to.be.bignumber.eq(amplAmount);
                });

                describe("totalSupply x 10000", async () => {
                    before(async () => {
                        await blockchain.saveSnapshotAsync();

                        const targetTotalSupply = (await ampl.totalSupply()).mul(new BN(10000));
                        await rebaseToTotalSupply(targetTotalSupply);
                    });

                    after(async () => {
                        await blockchain.revertAsync();
                    });

                    it("zero", async () => {
                        expect(await campl.toUnderlyingForIssue(ZERO)).to.be.bignumber.eq(ZERO);
                        expect(await campl.toDerivativeForIssue(ZERO)).to.be.bignumber.eq(ZERO);
                        expect(await campl.toUnderlyingForReclaim(ZERO)).to.be.bignumber.eq(ZERO);
                        expect(await campl.toDerivativeForReclaim(ZERO)).to.be.bignumber.eq(ZERO);
                    });

                    it("small number", async () => {
                        expect(await campl.toUnderlyingForIssue(ONE)).to.be.bignumber.eq(ONE);
                        expect(await campl.toUnderlyingForReclaim(ONE)).to.be.bignumber.eq(new BN("0"));
                        expect(await campl.toDerivativeForIssue(ONE)).to.be.bignumber.eq(new BN("200000"));
                        expect(await campl.toDerivativeForReclaim(ONE)).to.be.bignumber.eq(new BN("200000"));

                        expect(await campl.toUnderlyingForIssue(TWO)).to.be.bignumber.eq(new BN("1"));
                        expect(await campl.toUnderlyingForReclaim(TWO)).to.be.bignumber.eq(new BN("0"));
                        expect(await campl.toDerivativeForIssue(TWO)).to.be.bignumber.eq(new BN("400000"));
                        expect(await campl.toDerivativeForReclaim(TWO)).to.be.bignumber.eq(new BN("400000"));

                        expect(await campl.toUnderlyingForIssue(new BN(10))).to.be.bignumber.eq(new BN("1"));
                        expect(await campl.toUnderlyingForReclaim(new BN(10))).to.be.bignumber.eq(new BN("0"));
                        expect(await campl.toDerivativeForIssue(new BN(10))).to.be.bignumber.eq(new BN("2000000"));
                        expect(await campl.toDerivativeForReclaim(new BN(10))).to.be.bignumber.eq(new BN("2000000"));

                        expect(await campl.toUnderlyingForIssue(new BN(100))).to.be.bignumber.eq(new BN("1"));
                        expect(await campl.toUnderlyingForReclaim(new BN(100))).to.be.bignumber.eq(new BN("0"));
                        expect(await campl.toDerivativeForIssue(new BN(100))).to.be.bignumber.eq(new BN("20000000"));
                        expect(await campl.toDerivativeForReclaim(new BN(100))).to.be.bignumber.eq(new BN("20000000"));
                    });

                    it("constants.MAX_UINT256", async () => {
                        await expectRevert(campl.toUnderlyingForIssue(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                        await expectRevert(campl.toDerivativeForIssue(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                        await expectRevert(campl.toUnderlyingForReclaim(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                        await expectRevert(campl.toDerivativeForReclaim(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                    });

                    it("toUnderlyingForIssue possible large amount", async () => {
                        let camplAmount = "100000000000000000000000000000000000000000000000000000000"; // 1e56
                        let expectAmount = "500000000000000000000000000000000000000000000000000"; // 5 x 1e50
                        expect(await campl.toUnderlyingForIssue(new BN(camplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                        await expectRevert(campl.toUnderlyingForIssue(new BN(camplAmount + "0")), "SafeMath: multiplication overflow");
                    });

                    it("toUnderlyingForReclaim possible large amount", async () => {
                        let camplAmount = "100000000000000000000000000000000000000000000000000000000"; // 1e56
                        let expectAmount = "500000000000000000000000000000000000000000000000000"; // 5 x 1e50
                        expect(await campl.toUnderlyingForReclaim(new BN(camplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                        await expectRevert(campl.toUnderlyingForReclaim(new BN(camplAmount + "0")), "SafeMath: multiplication overflow");
                    });

                    it("toDerivativeForIssue possible large amount", async () => {
                        let amplAmount = "1000000000000000000000000000000000000000000000000000"; // 1e51
                        let expectAmount = "200000000000000000000000000000000000000000000000000000000"; // 2 x 1e56
                        expect(await campl.toDerivativeForIssue(new BN(amplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                        await expectRevert(campl.toDerivativeForIssue(new BN(amplAmount + "0")), "SafeMath: multiplication overflow");
                    });

                    it("toDerivativeForReclaim possible large amount", async () => {
                        let amplAmount = "1000000000000000000000000000000000000000000000000000"; // 1e51
                        let expectAmount = "200000000000000000000000000000000000000000000000000000000"; // 2 x 1e56
                        expect(await campl.toDerivativeForReclaim(new BN(amplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                        await expectRevert(campl.toDerivativeForReclaim(new BN(amplAmount + "0")), "SafeMath: multiplication overflow");
                    });

                    it("toUnderlyingForIssue & rebase", async () => {
                        const camplAmount = e18(1);
                        const amplAmount = e9(5000);
                        expect(await campl.toUnderlyingForIssue(camplAmount)).to.be.bignumber.eq(amplAmount);

                        const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                        await ampl.rebase(rebaseDelta, {from: deployer});
                        expect(await campl.toUnderlyingForIssue(camplAmount)).to.be.bignumber.eq(getPercentOf(amplAmount, new BN("50")));
                    });

                    it("toDerivativeForIssue & rebase", async () => {
                        const amplAmount = e9(10000);
                        const camplAmount = e18(2);
                        expect(await campl.toDerivativeForIssue(amplAmount)).to.be.bignumber.eq(camplAmount);

                        const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                        await ampl.rebase(rebaseDelta, {from: deployer});
                        expect(await campl.toDerivativeForIssue(amplAmount)).to.be.bignumber.eq(getPercentOf(camplAmount, new BN("200")));
                    });

                    it("toUnderlyingForReclaim & rebase", async () => {
                        const camplAmount = e18(1);
                        const amplAmount = e9(5000);
                        expect(await campl.toUnderlyingForReclaim(camplAmount)).to.be.bignumber.eq(amplAmount);

                        const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                        await ampl.rebase(rebaseDelta, {from: deployer});
                        expect(await campl.toUnderlyingForIssue(camplAmount)).to.be.bignumber.eq(getPercentOf(amplAmount, new BN("50")));
                    });

                    it("toDerivativeForReclaim & rebase", async () => {
                        const amplAmount = e9(10000);
                        const camplAmount = e18(2);
                        expect(await campl.toDerivativeForReclaim(amplAmount)).to.be.bignumber.eq(camplAmount);

                        const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                        await ampl.rebase(rebaseDelta, {from: deployer});
                        expect(await campl.toDerivativeForIssue(amplAmount)).to.be.bignumber.eq(getPercentOf(camplAmount, new BN("200")));
                    });

                });

                describe("totalSupply / 10000", async () => {
                    before(async () => {
                        await blockchain.saveSnapshotAsync();

                        const targetTotalSupply = (await ampl.totalSupply()).div(new BN(10000));
                        await rebaseToTotalSupply(targetTotalSupply);
                    });

                    after(async () => {
                        await blockchain.revertAsync();
                    });

                    it("zero", async () => {
                        expect(await campl.toUnderlyingForIssue(ZERO)).to.be.bignumber.eq(ZERO);
                        expect(await campl.toDerivativeForIssue(ZERO)).to.be.bignumber.eq(ZERO);
                        expect(await campl.toUnderlyingForReclaim(ZERO)).to.be.bignumber.eq(ZERO);
                        expect(await campl.toDerivativeForReclaim(ZERO)).to.be.bignumber.eq(ZERO);
                    });

                    it("small number", async () => {
                        expect(await campl.toUnderlyingForIssue(ONE)).to.be.bignumber.eq(ONE);
                        expect(await campl.toUnderlyingForReclaim(ONE)).to.be.bignumber.eq(new BN("0"));
                        expect(await campl.toDerivativeForIssue(ONE)).to.be.bignumber.eq(new BN("20000000000000"));
                        expect(await campl.toDerivativeForReclaim(ONE)).to.be.bignumber.eq(new BN("20000000000000"));

                        expect(await campl.toUnderlyingForIssue(TWO)).to.be.bignumber.eq(new BN("1"));
                        expect(await campl.toUnderlyingForReclaim(TWO)).to.be.bignumber.eq(new BN("0"));
                        expect(await campl.toDerivativeForIssue(TWO)).to.be.bignumber.eq(new BN("40000000000000"));
                        expect(await campl.toDerivativeForReclaim(TWO)).to.be.bignumber.eq(new BN("40000000000000"));

                        expect(await campl.toUnderlyingForIssue(new BN(10))).to.be.bignumber.eq(new BN("1"));
                        expect(await campl.toUnderlyingForReclaim(new BN(10))).to.be.bignumber.eq(new BN("0"));
                        expect(await campl.toDerivativeForIssue(new BN(10))).to.be.bignumber.eq(new BN("200000000000000"));
                        expect(await campl.toDerivativeForReclaim(new BN(10))).to.be.bignumber.eq(new BN("200000000000000"));

                        expect(await campl.toUnderlyingForIssue(new BN(100))).to.be.bignumber.eq(new BN("1"));
                        expect(await campl.toUnderlyingForReclaim(new BN(100))).to.be.bignumber.eq(new BN("0"));
                        expect(await campl.toDerivativeForIssue(new BN(100))).to.be.bignumber.eq(new BN("2000000000000000"));
                        expect(await campl.toDerivativeForReclaim(new BN(100))).to.be.bignumber.eq(new BN("2000000000000000"));
                    });

                    it("constants.MAX_UINT256", async () => {
                        await expectRevert(campl.toUnderlyingForIssue(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                        await expectRevert(campl.toDerivativeForIssue(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                        await expectRevert(campl.toUnderlyingForReclaim(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                        await expectRevert(campl.toDerivativeForReclaim(constants.MAX_UINT256), "SafeMath: multiplication overflow");
                    });

                    it("toUnderlyingForIssue possible large amount", async () => {
                        let camplAmount = "10000000000000000000000000000000000000000000000000000000000000000"; // 1e64
                        let expectAmount = "500000000000000000000000000000000000000000000000000"; // 5 x 1e50
                        expect(await campl.toUnderlyingForIssue(new BN(camplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                        await expectRevert(campl.toUnderlyingForIssue(new BN(camplAmount + "0")), "SafeMath: multiplication overflow");
                    });

                    it("toUnderlyingForReclaim possible large amount", async () => {
                        let camplAmount = "10000000000000000000000000000000000000000000000000000000000000000"; // 1e64
                        let expectAmount = "500000000000000000000000000000000000000000000000000"; // 5 x 1e50
                        expect(await campl.toUnderlyingForReclaim(new BN(camplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                        await expectRevert(campl.toUnderlyingForReclaim(new BN(camplAmount + "0")), "SafeMath: multiplication overflow");
                    });

                    it("toDerivativeForIssue possible large amount", async () => {
                        let amplAmount = "1000000000000000000000000000000000000000000000000000"; // 1e51
                        let expectAmount = "20000000000000000000000000000000000000000000000000000000000000000"; // 2 x 1e64
                        expect(await campl.toDerivativeForIssue(new BN(amplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                        await expectRevert(campl.toDerivativeForIssue(new BN(amplAmount + "0")), "SafeMath: multiplication overflow");
                    });

                    it("toDerivativeForReclaim possible large amount", async () => {
                        let amplAmount = "1000000000000000000000000000000000000000000000000000"; // 1e51
                        let expectAmount = "20000000000000000000000000000000000000000000000000000000000000000"; // 2 x 1e64
                        expect(await campl.toDerivativeForReclaim(new BN(amplAmount))).to.be.bignumber.eq(new BN(expectAmount));
                        await expectRevert(campl.toDerivativeForReclaim(new BN(amplAmount + "0")), "SafeMath: multiplication overflow");
                    });

                    it("toUnderlyingForIssue & rebase", async () => {
                        const camplAmount = e18(1);
                        const amplAmount = e9(0.00005);
                        expect(await campl.toUnderlyingForIssue(camplAmount)).to.be.bignumber.eq(amplAmount);

                        const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                        await ampl.rebase(rebaseDelta, {from: deployer});
                        expect(await campl.toUnderlyingForIssue(camplAmount)).to.be.bignumber.eq(getPercentOf(amplAmount, new BN("50")));
                    });

                    it("toDerivativeForIssue & rebase", async () => {
                        const amplAmount = e9(0.0001);
                        const camplAmount = e18(2);
                        expect(await campl.toDerivativeForIssue(amplAmount)).to.be.bignumber.eq(camplAmount);

                        const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                        await ampl.rebase(rebaseDelta, {from: deployer});
                        expect(await campl.toDerivativeForIssue(amplAmount)).to.be.bignumber.eq(getPercentOf(camplAmount, new BN("200")));
                    });

                    it("toUnderlyingForReclaim & rebase", async () => {
                        const camplAmount = e18(1);
                        const amplAmount = e9(0.00005);
                        expect(await campl.toUnderlyingForReclaim(camplAmount)).to.be.bignumber.eq(amplAmount);

                        const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                        await ampl.rebase(rebaseDelta, {from: deployer});
                        expect(await campl.toUnderlyingForIssue(camplAmount)).to.be.bignumber.eq(getPercentOf(amplAmount, new BN("50")));
                    });

                    it("toDerivativeForReclaim & rebase", async () => {
                        const amplAmount = e9(0.0001);
                        const camplAmount = e18(2);
                        expect(await campl.toDerivativeForReclaim(amplAmount)).to.be.bignumber.eq(camplAmount);

                        const rebaseDelta = getPercentOf(await ampl.totalSupply(), new BN("50")).sub(await ampl.totalSupply());
                        await ampl.rebase(rebaseDelta, {from: deployer});
                        expect(await campl.toDerivativeForIssue(amplAmount)).to.be.bignumber.eq(getPercentOf(camplAmount, new BN("200")));
                    });
                });
            });

            describe("issue", async () => {
                beforeEach(async () => {
                    await blockchain.saveSnapshotAsync();
                });

                afterEach(async () => {
                    await blockchain.revertAsync();
                });

                async function issueTest(from: string, to: string, approveAmplAmount: BN, issueCamplAmount: BN) {
                    const [amplDiff, camplDiff] = await getDiffs(async () => {
                        await ampl.approve(campl.address, approveAmplAmount, {from: from});
                        await campl.issue(to, issueCamplAmount, {from: from});
                    });

                    const amplAmount = await campl.toUnderlyingForIssue(issueCamplAmount);

                    expect(getBN(amplDiff, from)).to.be.bignumber.eq(amplAmount.neg());
                    expect(getBN(camplDiff, to)).to.be.bignumber.eq(issueCamplAmount);

                    const logs = await getContractLogs(campl, ["Issue", "Move", "Reclaim"], await getLatestBlockNumber());
                    checkLogWhenIssue(logs, from, to, issueCamplAmount, amplAmount);
                }

                it("success: to myself", async () => {
                    const issueCamplAmount = e18(10);
                    const approveAmplAmount = await campl.toUnderlyingForIssue(issueCamplAmount);

                    await issueTest(user1, user1, approveAmplAmount, issueCamplAmount);
                });

                it("success: to other", async () => {
                    const issueCamplAmount = e18(10);
                    const approveAmplAmount = await campl.toUnderlyingForIssue(issueCamplAmount);

                    await issueTest(user1, user2, approveAmplAmount, issueCamplAmount);
                });

                it("success: small amount", async () => {
                    await issueTest(user1, user2, constants.MAX_UINT256, ONE);
                });

                it("success: all my ample balance", async () => {
                    const amplBalance = await ampl.balanceOf(user1);
                    const camplAmount = await campl.toDerivativeForIssue(amplBalance);

                    await issueTest(user1, user2, constants.MAX_UINT256, camplAmount);
                });

                it("fail: not enough allowance", async () => {
                    const issueCamplAmount = e18(10);
                    const approveAmplAmount = await campl.toUnderlyingForIssue(issueCamplAmount);

                    await expectRevert(
                        issueTest(user1, user2, approveAmplAmount.sub(ONE), issueCamplAmount),
                        "Campl.issue: not enough AMPL allowance"
                    );
                });

                it("fail: issue too much amount", async () => {
                    const issueCamplAmount = constants.MAX_UINT256;

                    await expectRevert(
                        issueTest(user1, user2, constants.MAX_UINT256, issueCamplAmount),
                        "SafeMath: multiplication overflow"
                    );
                });

                it("fail: to is ZERO_ADDRESS", async () => {
                    const issueCamplAmount = e18(10);

                    await expectRevert(
                        issueTest(user1, ZERO_ADDRESS, constants.MAX_UINT256, issueCamplAmount),
                        "ERC20: mint to the zero address"
                    );
                });

                it("fail: zero amount", async () => {
                    const issueCamplAmount = ZERO;

                    await expectRevert(
                        issueTest(user1, user2, constants.MAX_UINT256, issueCamplAmount),
                        "Campl.issue: 0 amount"
                    );
                });

                it("fail: more than ampl balance", async () => {
                    const amplBalance = await ampl.balanceOf(user1);
                    const camplAmount = await campl.toDerivativeForIssue(amplBalance.add(ONE));

                    await expectRevert(
                        issueTest(user1, user2, constants.MAX_UINT256, camplAmount),
                        "Campl.issue: not enough AMPL balance"
                    );
                });
            });

            describe("issueIn", async () => {
                beforeEach(async () => {
                    await blockchain.saveSnapshotAsync();
                });

                afterEach(async () => {
                    await blockchain.revertAsync();
                });

                async function issueInTest(from: string, to: string, approveAmplAmount: BN, amplAmount: BN) {
                    const [amplDiff, camplDiff] = await getDiffs(async () => {
                        await ampl.approve(campl.address, approveAmplAmount, {from: from});
                        await campl.issueIn(to, amplAmount, {from: from});
                    });

                    const camplAmount = await campl.toDerivativeForIssue(amplAmount);

                    expect(getBN(amplDiff, from)).to.be.bignumber.eq(amplAmount.neg());
                    expect(getBN(camplDiff, to)).to.be.bignumber.eq(camplAmount);

                    const logs = await getContractLogs(campl, ["Issue", "Move", "Reclaim"], await getLatestBlockNumber());
                    checkLogWhenIssue(logs, from, to, camplAmount, amplAmount);
                }

                it("success: to myself", async () => {
                    const amplAmount = e9(10);
                    const approveAmplAmount = amplAmount;

                    await issueInTest(user1, user1, approveAmplAmount, amplAmount);
                });

                it("success: to other", async () => {
                    const amplAmount = e9(10);
                    const approveAmplAmount = amplAmount;

                    await issueInTest(user1, user2, approveAmplAmount, amplAmount);
                });

                it("success: small amount", async () => {
                    await issueInTest(user1, user2, constants.MAX_UINT256, ONE);
                });

                it("success: all my ample balance", async () => {
                    const amplBalance = await ampl.balanceOf(user1);

                    await issueInTest(user1, user2, constants.MAX_UINT256, amplBalance);
                });

                it("fail: not enough allowance", async () => {
                    const amplAmount = e9(10);

                    await expectRevert(
                        issueInTest(user1, user2, amplAmount.sub(ONE), amplAmount),
                        "Campl.issueIn: not enough AMPL allowance"
                    );
                });

                it("fail: issue too much amount", async () => {
                    const amplAmount = constants.MAX_UINT256;

                    await expectRevert(
                        issueInTest(user1, user2, constants.MAX_UINT256, amplAmount),
                        "Campl.issueIn: not enough AMPL balance"
                    );
                });

                it("fail: to is ZERO_ADDRESS", async () => {
                    const amplAmount = e9(10);

                    await expectRevert(
                        issueInTest(user1, ZERO_ADDRESS, constants.MAX_UINT256, amplAmount),
                        "ERC20: mint to the zero address"
                    );
                });

                it("fail: zero amount", async () => {
                    const amplAmount = ZERO;

                    await expectRevert(
                        issueInTest(user1, user2, constants.MAX_UINT256, amplAmount),
                        "Campl.issueIn: 0 amount"
                    );
                });

                it("fail: more than ampl balance", async () => {
                    const amplBalance = await ampl.balanceOf(user1);

                    await expectRevert(
                        issueInTest(user1, user2, constants.MAX_UINT256, amplBalance.add(ONE)),
                        "Campl.issueIn: not enough AMPL balance"
                    );
                });
            });

            describe("reclaim", async () => {
                before(async () => {
                    await blockchain.saveSnapshotAsync();

                    await ampl.approve(campl.address, constants.MAX_UINT256, {from: user1});
                    await campl.issueIn(user1, e9(10000), {from: user1});
                });

                beforeEach(async () => {
                    await blockchain.saveSnapshotAsync();
                });

                afterEach(async () => {
                    await blockchain.revertAsync();
                });

                after(async () => {
                    await blockchain.revertAsync();
                });

                async function reclaimTest(from: string, to: string, camplAmount: BN) {
                    const [amplDiff, camplDiff] = await getDiffs(async () => {
                        await campl.reclaim(to, camplAmount, {from: from});
                    });

                    const amplAmount = await campl.toUnderlyingForReclaim(camplAmount);

                    expect(getBN(camplDiff, from)).to.be.bignumber.eq(camplAmount.neg());
                    expect(getBN(amplDiff, campl.address)).to.be.bignumber.eq(amplAmount.neg());
                    expect(getBN(amplDiff, to)).to.be.bignumber.eq(amplAmount);

                    const logs = await getContractLogs(campl, ["Issue", "Move", "Reclaim"], await getLatestBlockNumber());
                    checkLogWhenReclaim(logs, from, to, camplAmount, amplAmount);
                }

                it("success: to myself", async () => {
                    await reclaimTest(user1, user1, e18(10));
                });

                it("success: to other", async () => {
                    await reclaimTest(user1, user2, e18(10));
                });

                it("success: all balance", async () => {
                    const camplBalance = await campl.balanceOf(user1);
                    await reclaimTest(user1, user2, camplBalance);
                });

                it("fail: more than campl balance", async () => {
                    const camplBalance = await campl.balanceOf(user1);
                    await expectRevert(
                        reclaimTest(user1, user2, camplBalance.add(ONE)),
                        "ERC20: burn amount exceeds balance"
                    );
                });

                it("fail: to is ZERO_ADDRESS", async () => {
                    await expectRevert(
                        reclaimTest(user1, ZERO_ADDRESS, e18(1)),
                        "Campl.reclaim: reclaim to the zero address"
                    );
                });

                it("fail: 0 amount", async () => {
                    await expectRevert(
                        reclaimTest(user1, user2, ZERO),
                        "Campl.reclaim: 0 amount"
                    );
                });
            });

            describe("reclaimIn", async () => {
                before(async () => {
                    await blockchain.saveSnapshotAsync();

                    await ampl.approve(campl.address, constants.MAX_UINT256, {from: user1});
                    await campl.issueIn(user1, e9(10000), {from: user1});
                });

                beforeEach(async () => {
                    await blockchain.saveSnapshotAsync();
                });

                afterEach(async () => {
                    await blockchain.revertAsync();
                });

                after(async () => {
                    await blockchain.revertAsync();
                });

                async function reclaimInTest(from: string, to: string, amplAmount: BN) {
                    const camplAmount = await campl.toDerivativeForReclaim(amplAmount);
                    const [amplDiff, camplDiff] = await getDiffs(async () => {
                        await campl.reclaimIn(to, amplAmount, {from: from});
                    });

                    expect(getBN(camplDiff, from)).to.be.bignumber.eq(camplAmount.neg());
                    expect(getBN(amplDiff, campl.address)).to.be.bignumber.eq(amplAmount.neg());
                    expect(getBN(amplDiff, to)).to.be.bignumber.eq(amplAmount);

                    const logs = await getContractLogs(campl, ["Issue", "Move", "Reclaim"], await getLatestBlockNumber());
                    checkLogWhenReclaim(logs, from, to, camplAmount, amplAmount);
                }

                it("success: to myself", async () => {
                    await reclaimInTest(user1, user1, e9(10));
                });

                it("success: to other", async () => {
                    await reclaimInTest(user1, user2, e9(10));
                });

                it("success: all balance", async () => {
                    const underlyingBalance = await campl.underlyingBalanceOf(user1);
                    await reclaimInTest(user1, user2, underlyingBalance);
                });

                it("fail: more than campl balance", async () => {
                    const underlyingBalance = await campl.underlyingBalanceOf(user1);

                    await expectRevert(
                        reclaimInTest(user1, user2, underlyingBalance.add(ONE)),
                        "ERC20: burn amount exceeds balance"
                    );
                });

                it("fail: to is ZERO_ADDRESS", async () => {
                    await expectRevert(
                        reclaimInTest(user1, ZERO_ADDRESS, e18(1)),
                        "Campl.reclaimIn: reclaimIn to the zero address"
                    );
                });

                it("fail: 0 amount", async () => {
                    await expectRevert(
                        reclaimInTest(user1, user2, ZERO),
                        "Campl.reclaimIn: 0 amount"
                    );
                });
            });
        });

    });

});



