// const Web3 = require('web3');
import Web3 from 'web3';
import BN from 'bn.js';
import { DEFAULT_GAS, ZERO_ADDRESS } from './constants';


// use globally injected web3 to find the currentProvider and wrap with web3 v1.0
export const getWeb3 = () => {
  // const myWeb3: Web3 = new Web3();
  // myWeb3.setProvider(provider);
  const myWeb3 : Web3 = web3;

  return myWeb3;
};

// assumes passed-in web3 is v1.0 and creates a function to receive contract name
export const getContractInstance = (_artifact: any, _contractAddress: string = _artifact.address) => {
  const web3 = getWeb3();
  return new web3.eth.Contract(_artifact.abi, _contractAddress);
};

export const getGasUsageInEth: (_: any) => Promise<BN> = async _txHash => {
  const web3 = getWeb3();
  const txReceipt = await web3.eth.getTransactionReceipt(_txHash);
    const txn = await web3.eth.getTransaction(_txHash);
    const { gasPrice } = txn;
    const { gasUsed } = txReceipt;

    return new BN(gasPrice).mul(new BN(gasUsed));
};

export const txnFrom = (_from: string) => {
  return { from: _from, gas: DEFAULT_GAS };
};

export const blankTxn = async (_from: string) => {
  const web3 = getWeb3();
  await web3.eth.sendTransaction({
    from: _from,
    to: ZERO_ADDRESS,
    value: '1',
  });
};
