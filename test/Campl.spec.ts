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
import { ZERO, ONE, TWO, THREE, ONE_HUNDRED } from '@testUtils/constants';


import { expectRevert, singletons } from '@openzeppelin/test-helpers';
import { hexlify, keccak256, toUtf8Bytes } from 'ethers/utils'
import { ecsign, ECDSASignature } from 'ethereumjs-util'

import BigNumber from 'bignumber.js';
import { ALPN_ENABLED } from 'constants';

import { Account, getSnapshot, Snapshot, Snap, getValueByAddress, getValue } from '@testUtils/snapshot';
import { bnSnapshotDiff, getBN } from '@testUtils/bnSnapshot';
import { getDiffieHellman } from 'crypto';

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


contract("Campl", ([deployer, user1, user2]) => {
    let campl: CamplInstance;
    let ampl: AmplMockInstance;
    const name = "Compatable AMPL";
    const symbol = "CAMPL";
    const decimal = new BN(18);

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
        const expectedDerivativeAmount = await campl.toDerivativeForIssue(underlyingAmount);

        const [amplDiff, camplDiff] = await getDiffs(async () => {
            await ampl.approve(campl.address, underlyingAmount, {from: account});
            await campl.issueIn(account, underlyingAmount, { from: account });
        });

        expect(getBN(amplDiff, account)).to.be.bignumber.eq(underlyingAmount.neg());
        expect(getBN(amplDiff, campl.address)).to.be.bignumber.eq(underlyingAmount);

        expect(getBN(camplDiff, account)).to.be.bignumber.eq(expectedDerivativeAmount);
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
        describe("basic erc20 test", async () => {
            it("name, symbol, decimals, totalSupply, balanceOf, version", async () => {
                expect(await campl.name()).to.be.eq(name);
                expect(await campl.symbol()).to.be.eq(symbol);
                expect(await campl.decimals()).to.be.bignumber.eq(decimal);

                expect(await campl.totalSupply()).to.be.bignumber.eq(ZERO);
                expect(await campl.balanceOf(deployer)).to.be.bignumber.eq(ZERO);
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

        describe.skip("Ampl value integrity test", async () => {
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
                // rebase로 인한 오차. 최대 account len 만큼 생길 수 있다.
                expect(await sumAmpl(accounts2)).to.be.bignumber
                    .lte(amplTotalSupply)
                    .gte(amplTotalSupply.sub(new BN(accounts2.length)));

                // 횟수에 따라 누적되는 issue, reclaim으로 인한 오차 + rebase로 인한 오차 (최대 account len)
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
                    // issue, reclaim 의 오차는 누적된다. 그 오차는 campl에 쌓인다.
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
                // rebase 중에 campl과 user1간의 전송으로 인한 오차가 남아닜다.
                expect(await sumAmpl(accounts2)).to.be.bignumber
                    .lte(totalSupply)
                    .gte(totalSupply.sub(new BN(2)));
                // issue, reclaim 오차는 여전히 남아 있다.
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
                // rebase 중에 campl과 user1, user2간의 전송으로 인한 오차가 남아닜다.
                expect(await sumAmpl(accounts2)).to.be.bignumber
                    .lte(totalSupply)
                    .gte(totalSupply.sub(new BN(3)));
                // issue, reclaim 오차는 여전히 남아 있다.
                expect(await sumAmplAndCamplUnderlying(accounts)).to.be.bignumber
                    .lte(totalSupply)
                    .gte(totalSupply.sub(new BN(loopCount*2+1)));
            });
        });

        describe.skip("Current totalSupply testing", async () => {
            beforeEach(async () => {
                await blockchain.saveSnapshotAsync();
                await rebaseToTotalSupply(new BN("114267479711606026"));
            });

            afterEach(async () => {
                await blockchain.revertAsync();
            });

            it("test", async () => {
                const underlyingAmount = e9(1);
                await issueIn(underlyingAmount, deployer);
                console.log((await campl.balanceOf(deployer)).toString());
            });
        });


        describe("IDerivativeToken test", async () => {
        });

    });

});



