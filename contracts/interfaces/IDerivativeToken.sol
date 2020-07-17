pragma solidity 0.6.8;

interface ICompatibleDerivativeToken {
    event Issue(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 derivativeAmount,
        uint256 underlyingAmount
    );
    event Reclaim(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 derivativeAmount,
        uint256 underlyingAmount
    );

    event Move(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 derivativeAmount,
        uint256 underlyingAmount
    );

    function issue(address to, uint256 derivativeAmount) external;
    function issueIn(address to, uint256 underlyingAmount) external;

    function reclaim(address to, uint256 derivativeAmount) external;
    function reclaimIn(address to, uint256 underlyingAmount) external;

    function underlying() external view returns (address);

    function sync() external;

    function underlyingBalanceOf(address account) external view returns (uint256);

    function toUnderlyingForIssue(uint256 derivativeAmount) external view returns(uint256);
    function toDerivativeForIssue(uint256 underlyingAmount) external view returns(uint256);
    function toUnderlyingForReclaim(uint256 derivativeAmount) external view returns(uint256);
    function toDerivativeForReclaim(uint256 underlyingAmount) external view returns(uint256);
}

interface IDerivativeToken is ICompatibleDerivativeToken {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);

    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}