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

    constructor(IERC20 _ampl) public ERC20("Compatible AMPL", "CAMPL") {
        ampl = _ampl;
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override(ERC20) {
        emit Move(_msgSender(), from, to, amount, toUnderlyingForReclaim(amount));
    }

    function roundUpDiv(uint256 x, uint256 y) private pure returns (uint256) {
        return (x.add(y.sub(1))).div(y);
    }

    function issue(address to, uint256 derivativeAmount) external override {
        require(derivativeAmount != 0, "Campl.issue: 0 amount");
        uint256 underlyingAmount = toUnderlyingForIssue(derivativeAmount);
        require(ampl.allowance(_msgSender(), address(this)) >= underlyingAmount, "Campl.issue: not enough AMPL allowance");
        require(ampl.balanceOf(_msgSender()) >= underlyingAmount, "Campl.issue: not enough AMPL balance");

        _mint(to, derivativeAmount);

        emit Issue(_msgSender(), _msgSender(), to, derivativeAmount, underlyingAmount);

        ampl.transferFrom(_msgSender(), address(this), underlyingAmount);
    }

    function issueIn(address to, uint256 underlyingAmount) external override {
        require(underlyingAmount != 0, "Campl.issueIn: 0 amount");
        require(ampl.allowance(_msgSender(), address(this)) >= underlyingAmount, "Campl.issueIn: not enough AMPL allowance");
        require(ampl.balanceOf(_msgSender()) >= underlyingAmount, "Campl.issueIn: not enough AMPL balance");
        uint256 derivativeAmount = toDerivativeForIssue(underlyingAmount);

        _mint(to, derivativeAmount);

        emit Issue(_msgSender(), _msgSender(), to, derivativeAmount, underlyingAmount);

        ampl.transferFrom(_msgSender(), address(this), underlyingAmount);
    }

    function reclaim(address to, uint256 derivativeAmount) external override {
        require(derivativeAmount != 0, "Campl.reclaim: 0 amount");
        require(to != address(0), "Campl.reclaim: reclaim to the zero address");

        uint256 underlyingAmount = toUnderlyingForReclaim(derivativeAmount);

        _burn(_msgSender(), derivativeAmount);

        emit Reclaim(_msgSender(), _msgSender(), to, derivativeAmount, underlyingAmount);

        ampl.transfer(to, underlyingAmount);
    }

    function reclaimIn(address to, uint256 underlyingAmount) external override {
        require(underlyingAmount != 0, "Campl.reclaimIn: 0 amount");
        require(to != address(0), "Campl.reclaimIn: reclaimIn to the zero address");
        uint256 derivativeAmount = toDerivativeForReclaim(underlyingAmount);

        _burn(_msgSender(), derivativeAmount);

        emit Reclaim(_msgSender(), _msgSender(), to, derivativeAmount, underlyingAmount);

        ampl.transfer(to, underlyingAmount);
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

