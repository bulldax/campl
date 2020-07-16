import BN from "bn.js";

export type LogData = {
    logIndex: any;
    event: any;
    args: any;
}

export type Log = LogData[];

export async function printTxLog(_prefix:string, _tx: Promise<any>) {
    const response = await _tx;
    const logs = response.logs;

    console.log(_prefix + "------------");
    for (let i=0; i < logs.length; i++) {

        const l = logs[i];
        let msg = l.event;
        for (let k=0; k < l.args.__length__; k++) {
            let arg = l.args[k.toString()];
            if (arg) {
                msg += " " + arg.toString();
            } else {
                msg += " " + "{null}";
            }
        }
        console.log("[", msg, "]");
    }
}

export async function getContractLogs(_contract: any, _eventName: string[], _fromBlock: number | BN) {
    const abi: any[] = _contract.abi;
    const address: string = _contract.address;

    const logs = await web3.eth.getPastLogs({
        fromBlock: _fromBlock,
        address: address
    });

    const eventABI = abi.filter(x => x.type == 'event' && _eventName.includes(x.name));

    const decodeLogs = [];
    for(let i=0; i < eventABI.length; i++) {
        const eAbi = eventABI[i];
        const inputs: any[] = eAbi.inputs;
        const eventSignature = `${eAbi.name}(${inputs.map(input => input.type).join(',')})`
        const eventTopic = web3.utils.sha3(eventSignature);

        for(let i=0; i < logs.length; i++) {
            const log = logs[i];
            const l = {};
            if (log.topics.length > 0 && log.topics[0] == eventTopic) {
                const l = {
                    logIndex: log.logIndex,
                    event: eAbi.name,
                    args: web3.eth.abi.decodeLog(eAbi.inputs, log.data, log.topics.slice(1))
                }
                decodeLogs.push(l);
            }
        }
    }

    return decodeLogs;
}


export async function printContractLogs(_contractEventPair: [any, any][], _fromBlock: number ) {
    let logs: any[] = [];

    for (let i=0; i < _contractEventPair.length; i++) {
        let pair = _contractEventPair[i];
        let l: any[] = await getContractLogs(pair[0], pair[1], _fromBlock);
        logs = logs.concat(l);
    }

    logs = logs.sort((x,y) => x.logIndex - y.logIndex);
    console.log(logs);
}
