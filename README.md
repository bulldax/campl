# CAMPL

![CI](https://github.com/eljovist/campl/workflows/CI/badge.svg)

**This is not an audited proof-of-concept. Use at your own risk.**

![logo](https://github.com/eljovist/campl/raw/master/imgs/c_1.png)

Campl (CAMPL) is an ERC20 token which tracks Ampleforth (AMPL) market cap (MC).

Owing to Ampleforth (AMPL) elastic supply mechanism, its supply expands and contracts in response to the demand. Supply changes occur via a smart contract function (rebase) every 24 hours resulting in adjusted number of tokens in each holder's wallet proportionally.  The amount of CAMPL tokens, however, does not change during rebases, because it tracks the total market cap of AMPL.

Additionally, the amount of AMPL tokens reclaimed will be different depending on the rebase rates during the holding period, but the holder will always maintain the same percentage of the Ampleforth network as if he/she held AMPL in the first place.

Proposed CAMPL smart contract offers:
- Compatibility with centralized exchanges makes it easier to list and does not require to pause trading during rebases;
- To track AMPL value expressed proportionally to the AMPL market cap ( AMPL price × supply), so CAMPL's price makes it simple to track the real AMPL price changes, especially during rebases

## test
```console
$ yarn
$ yarn totaltest
```

## mainnet

Deployed at [0xa4a08ee55120165b24bf8213a6ffb9eda6ff8d19](https://etherscan.io/address/0xa4a08ee55120165b24bf8213a6ffb9eda6ff8d19)

## audit

The smart contract is not audited yet. We are currently applying for the audit and the audit section will be updated when the audit is done.

## documentation

### issue
CAMPL can be issued via the `issue` function by depositing AMPL.
In order to issue CAMPL, two parameters are required. A receiving account as `to` parameter and the number of CAMPL to issue as `derivativeAmount` parameter.
As a result, CAMPL is minted and received AMPL is stored in the CAMPL smart contract.
Before calling an `issue` function, AMPL `approve` function is required for CAMPL to call AMPL `transferFrom` function. The exact amount of AMPL required for issuing CAMPL through the `toUnderlyingForIssue` view function is displayed.
```javascript
const amplAmount = await campl.toUnderlyingForIssue(camplAmount);
await ampl.approve(campl.address, amplAmount, {from: from});
await campl.issue(to, camplAmount, {from: from});
```
### issueIn
`issueIn` has the same functionality as the `issue` but depositing AMPL amount is required for the `underlyingAmount` parameter.
Before calling `issueIn`function , `approve` of AMPL is required. The amount of CAMPL issued through AMPL is shown by the `toDerivativeForIssue` view function.
```javascript
await ampl.approve(campl.address, amplAmount, {from: from});
await campl.issueIn(to, amplAmount, {from: from});
```
### reclaim
AMPL is reclaimed with CAMPL by ‘reclaim’ function. At this time, CAMPL is burned and AMPL is returned. The `derivativeAmount` CAMPL is burned and corresponding amount of AMPL is received. The `toUnderlyingForReclaim` view function shows how many AMPL will be received.
### reclaimIn
‘reclaimIn’ has the same function as `reclaim`, but a number of AMPL receivable is shown as `underlyingAmount` parameter.
The corresponding CAMPL to be burned through the `toDerivativeForReclaim` view method is displayed.
