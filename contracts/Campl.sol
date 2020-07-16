// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IDerivativeToken, ICompatibleDerivativeToken } from './interfaces/IDerivativeToken.sol';

contract Campl is ERC20, ICompatibleDerivativeToken {
    using SafeMath for uint256;

    IERC20 ampl;
    uint256 constant E26 = 1.00E26;

    constructor(IERC20 _ampl) public ERC20("Compatable AMPL", "CAMPL") {
        ampl = _ampl;
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override(ERC20) {
        sync();
        emit Move(_msgSender(), from, to, amount, toUnderlyingForReclaim(amount));
    }

    function roundUpDiv(uint256 x, uint256 y) private pure returns (uint256) {
        return (x.add(y.sub(1))).div(y);
    }

    function issue(address to, uint256 derivativeAmount) external override {
        uint256 underlyingAmount = toUnderlyingForIssue(derivativeAmount);

        require(ampl.allowance(_msgSender(), address(this)) >= underlyingAmount, "Campl.issue: not enough AMPL allowance");
        ampl.transferFrom(_msgSender(), address(this), underlyingAmount);

        _mint(to, derivativeAmount);

        emit Issue(_msgSender(), _msgSender(), to, derivativeAmount, underlyingAmount);
    }

    function issueIn(address to, uint256 underlyingAmount) external override {
        require(ampl.allowance(_msgSender(), address(this)) >= underlyingAmount, "Campl.issueIn: not enough AMPL allowance");
        uint256 derivativeAmount = toDerivativeForIssue(underlyingAmount);
        ampl.transferFrom(_msgSender(), address(this), underlyingAmount);

        _mint(to, derivativeAmount);

        emit Issue(_msgSender(), _msgSender(), to, derivativeAmount, underlyingAmount);
    }

    function reclaim(address to, uint256 derivativeAmount) external override {
        uint256 underlyingAmount = toUnderlyingForReclaim(derivativeAmount);
        // TODO: remove
        require(ampl.balanceOf(address(this)) >= underlyingAmount, "Campl.reclaim: not enough AMPL balance");

        _burn(_msgSender(), derivativeAmount);

        ampl.transfer(to, underlyingAmount);
        emit Reclaim(_msgSender(), _msgSender(), to, derivativeAmount, underlyingAmount);
    }

    function reclaimIn(address to, uint256 underlyingAmount) external override {
        // TODO: remove
        require(ampl.balanceOf(address(this)) >= underlyingAmount, "Campl.reclaimIn: not enough AMPL balance");
        uint256 derivativeAmount = toDerivativeForReclaim(underlyingAmount);

        _burn(_msgSender(), derivativeAmount);

        ampl.transfer(to, underlyingAmount);
        emit Reclaim(_msgSender(), _msgSender(), to, derivativeAmount, underlyingAmount);
    }

    function underlying() external view override returns (address) {
        return address(ampl);
    }

    function sync() public override {
    }

    function underlyingBalanceOf(address account) external view override returns (uint256) {
        return toUnderlyingForReclaim(balanceOf(account));
    }

    function toUnderlyingForIssue(uint256 derivativeAmount) public view override returns(uint256) {
        return roundUpDiv(derivativeAmount.mul(ampl.totalSupply()), E26);
    }

    function toDerivativeForIssue(uint256 underlyingAmount) public view override returns(uint256) {
        return underlyingAmount.mul(E26).div(ampl.totalSupply());
    }

    function toUnderlyingForReclaim(uint256 derivativeAmount) public view override returns(uint256) {
        return derivativeAmount.mul(ampl.totalSupply()).div(E26);
    }

    function toDerivativeForReclaim(uint256 underlyingAmount) public view override returns(uint256) {
        return roundUpDiv(underlyingAmount.mul(E26), ampl.totalSupply());
    }
}

