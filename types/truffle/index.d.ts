declare namespace Truffle {
    interface TransactionDetails {
      from?: string;
      gas?: BN | number | string;
      gasPrice?: BN | number | string;
      value?: BN | string;
      useGSN?: boolean;
      paymaster?: string;
      forwarder?: string;
      forceGasPrice?: BN | number | string;
    }
}