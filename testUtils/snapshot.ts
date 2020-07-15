import BN, { min } from "bn.js";
import { ZERO } from './constants';

export type Account = {
    name: string,
    address: string
}

export type Snap = {
    account: Account,
    value: any
}

export type Snapshot = Snap[];

export async function getSnapshot(_accounts: Account[], func: (_account: Account) => Promise<any>): Promise<Snapshot> {
    const promiseList = _accounts.map(async _account => await func(_account));
    const values: any[] = await Promise.all(promiseList);

    return values.map((_v:any, _i: number) => {
        return{ account: _accounts[_i], value: _v };
    });
}

export function getValue(_snapshot: Snapshot, accountMatch: (_account: Account) => boolean): any {
    const ret = _snapshot.filter(function(_value: Snap, _index: number, _array: Snap[]) {
        return accountMatch(_value.account);
    });

    if (ret.length > 0) {
        return ret[0].value;
    } else {
        return null;
    }
}

export function snapshotDiff(
    _s1: Snapshot,
    _s2: Snapshot,
    _diffFunc: (_v1: any, _v2: any) => any,
    _diffCheck: (_v: any) => boolean
)
    : Snapshot
{
    const results: Snapshot = [];
    for(let i=0; i < _s1.length; i++) {
        for(let k=0; k < _s2.length; k++) {
            if (_s1[i].account.address == _s2[k].account.address) {
                const diff = _diffFunc(_s1[i].value, _s2[i].value);
                if (_diffCheck(diff)) {
                    results.push({ account: _s1[i].account, value: diff });
                }
            }
        }
    }
    return results;
}

function genAccountMatch(_address: string) {
    function intAccountMatch(_account: Account): boolean {
        return _account.address == _address;
    }
    return intAccountMatch;
}

export function getValueByAddress(_snapshot: Snapshot, _address: string): any {
    return getValue(_snapshot, genAccountMatch(_address));
}

export function map(_s: Snapshot, _toFunc: (_snap: Snap) => Snap): Snapshot {
    return _s.map((_snap: Snap) => {
        return { account: _snap.account, value: _toFunc(_snap.value) };
    });
}


