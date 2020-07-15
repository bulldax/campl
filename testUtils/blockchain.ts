const promisify = require('tiny-promisify');

export class Blockchain {
    private web3Provider: any;
    private snapshotIds: number[] = [];

    constructor(_web3Provider: any) {
        this.web3Provider = _web3Provider;
    }

    public async saveSnapshotAsync(): Promise<void> {
        const response = await this.sendJSONRpcRequestAsync('evm_snapshot', []);
        this.snapshotIds.push(parseInt(response.result, 16));
    }

    public async revertAsync(): Promise<void> {
        if (this.snapshotIds.length == 0) {
            throw new Error('snapshotIds length == 0');
        }
        await this.sendJSONRpcRequestAsync('evm_revert', [this.snapshotIds.pop()]);
    }

    public async increaseTimeAsync(
        _duration: BN,
    ): Promise<any> {
        await this.sendJSONRpcRequestAsync('evm_increaseTime', [_duration.toNumber()]);
    }

    public async mineBlockAsync(): Promise<any> {
        await this.sendJSONRpcRequestAsync('evm_mine', []);
    }

    public async advanceBlockAsync(_n: number): Promise<any> {
        let promiseList: Promise<any>[] = [];

        for(let i=0; i < _n; i++) {
            promiseList.push(this.mineBlockAsync());
        }

        await Promise.all(promiseList);
    }

    private async sendJSONRpcRequestAsync(
        _method: string,
        _params: any[],
    ): Promise<any> {
        return promisify(this.web3Provider.send, {
            context: this.web3Provider,
    })({
        jsonrpc: '2.0',
        method: _method,
        params: _params,
        id: new Date().getTime(),
    });
    }
}

