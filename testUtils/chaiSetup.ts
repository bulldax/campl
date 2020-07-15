import * as chai from "chai";
import ChaiAsPromised = require("chai-as-promised");
import BN from 'bn.js';

// const { BN } = require('@openzeppelin/test-helpers');



// import ChaiBN = require('chai-bn');

export class ChaiSetup {
    private isConfigured: boolean;

    constructor() {
        this.isConfigured = false;
    }

    public configure() {
        if (this.isConfigured) {
            return;
        }

        chai.config.includeStack = true;
        // chai.use(ChaiBigNumber(bn));
        chai.use(require('chai-bn')(BN));
        chai.use(ChaiAsPromised);
        this.isConfigured = true;
    }
}

export default new ChaiSetup();
