import BN from 'bn.js';

export async function getEthBalance(_account: string) {
    return new BN(await web3.eth.getBalance(_account));
};

export async function ethBalanceDiff(_account: string, fn: () => Promise<Truffle.TransactionResponse>) : Promise<BN> {
    const beforeBalance = new BN(await web3.eth.getBalance(_account));
    const tx = await fn();
    const gasPrice = new BN(await web3.eth.getGasPrice());
    const gasUsed = new BN(tx.receipt['gasUsed']);
    const gasTotal = gasPrice.mul(gasUsed);
    return new BN(await web3.eth.getBalance(_account)).sub(beforeBalance).add(gasTotal);
}

