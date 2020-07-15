pragma solidity ^0.6.2;

// 기존의 ERC777 implementation을 그대로 사용하기 위해서, 컴파일에러가 발생하지 않도록 인터페이스 정의
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
    // 만약 이 underliedToken이 이동된다면, 반드시 Move 이벤트를 구현해야 한다.
    // 어떤 방식으로 이동되는지는 상관이 없다. (즉, ERC20 의 transfer이든, ERC777의 send이든)
    // operator는 실제 이동을 시작한 주체 (트랜잭션 생성자)
    event Move(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 derivativeAmount,
        uint256 underlyingAmount
    );

    // underlying을 issue하기 위해서는 underlying이 ERC20인 경우에는 미리 approve가 되어 있어야 한다.
    // underlying이 ERC777인 경우에는 알아서 할 수 있다.
    // 이런 제한이 붙는 것을 표준이라고 할 수 있을까?
    function issue(address to, uint256 derivativeAmount) external;
    function issueIn(address to, uint256 underlyingAmount) external;

    // reclaimFrom은, 이것을 implement하는 토큰이 erc20 또는 erc777 처럼 operator가 대신 할 수 있는 것을 지원해야 하도록 강제한다.
    // 그러므로 DSRT는 reclaimFrom을 구현하겠지만, 이걸 표준에 넣지는 않는다.
    function reclaim(address to, uint256 derivativeAmount) external;
    function reclaimIn(address to, uint256 underlyingAmount) external;

    // 전송을 어떻게 할지는 각자 구현에 맡긴다. 단! 전송이 발생할때는 Move event를 발생시킨다.
    function underlying() external view returns (address);

    // 아래의 교환비 정보를 최신으로 유지하기 위한 method
    function sync() external;

    function underlyingBalanceOf(address account) external view returns (uint256);
    // 수수료등 각자의 정책에 따라, Issue와 Reclaim 할때의 교환 비율이 다를 수 있다. 이들 모두를 포함한 실제 교환 비를 리턴한다.
    // 그리고 Issue에서 underlying과 derivative를 교환할때 1개를 가지고 역수를 통해서 나머지를 구할 수 있다고 생각할 수 있지만,
    // 그렇지않을 수 있다. round 정책등에 의해 각자 다를 수 있으므로
    // view 이므로 최신이 아닐 수 있다. sync()를 수행하면 최신의 상태를 유지한다.
    function toUnderlyingForIssue(uint256 derivativeAmount) external view returns(uint256);
    function toDerivativeForIssue(uint256 underlyingAmount) external view returns(uint256);
    function toUnderlyingForReclaim(uint256 derivativeAmount) external view returns(uint256);
    function toDerivativeForReclaim(uint256 underlyingAmount) external view returns(uint256);
}

// 실제 IDerivativeToken interface full spec. 사용할때는 IDerivativeToken 으로 사용
interface IDerivativeToken is ICompatibleDerivativeToken {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);

    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}