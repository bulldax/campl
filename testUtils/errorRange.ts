import BN from 'bn.js';

export class ErrorRange {
    public min: BN;
    public max: BN;
    public negMin: BN;
    public negMax: BN;
    constructor(public _mean: number, _error: number=0.1) {
        this.min = new BN(this._mean * (1-_error));
        this.max = new BN(this._mean * (1+_error));
        this.negMax = new BN(-1 * this._mean * (1-_error));
        this.negMin = new BN(-1 * this._mean * (1+_error));
    }
}

