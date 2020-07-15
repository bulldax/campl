import BN, { min } from "bn.js";
import { ZERO } from './constants';
import { Snapshot, snapshotDiff, getValueByAddress } from "./snapshot";


export function bnSnapshotDiff(
    _s1: Snapshot,
    _s2: Snapshot
)
    : Snapshot
{
    function bnDiff(_v1: BN, _v2: BN): BN {
        return _v2.sub(_v1);
    }

    function notZero(_v: BN) : boolean {
        return !_v.eq(ZERO);
    }

    return snapshotDiff(_s1, _s2, bnDiff, notZero);
}

export function getBN(_snapshot: Snapshot, _address: string): BN {
    return getValueByAddress(_snapshot, _address);
}
