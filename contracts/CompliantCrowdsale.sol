pragma solidity ^0.4.18;

import "./WhitelistContract.sol";
import "./CompliantToken.sol";
import "../zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "../zeppelin-solidity/contracts/ownership/Ownable.sol";


contract CompliantCrowdsale is Ownable, Validator, Crowdsale {
    Whitelist public whiteListingContract;

    struct MintStruct {
        address to;
        uint256 tokens;
        uint256 weiAmount;
    }

    mapping (uint => MintStruct) public pendingMints;
    uint256 public currentMintNonce;

    event MintRejected(
        address indexed to,
        uint256 value,
        uint256 amount,
        uint256 indexed nonce,
        uint256 reason
    );

    event ContributionRegistered(
        address beneficiary,
        uint256 tokens,
        uint256 weiAmount,
        uint256 nonce
    );

    event WhiteListingContractSet(address indexed _whiteListingContract);

    function setWhitelistContract(address whitelistAddress) public onlyValidator {
        require(whitelistAddress != address(0));
        whiteListingContract = Whitelist(whitelistAddress);
        WhiteListingContractSet(whiteListingContract);
    }

    function CompliantCrowdsale(
        address whitelistAddress,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _rate,
        address _wallet,
        MintableToken _token
    )
        public
        Crowdsale(_startTime, _endTime, _rate, _wallet, _token)
    {
        setWhitelistContract(whitelistAddress);
    }

    function buyTokens(address beneficiary) public payable {
        require(beneficiary != address(0));
        require(whiteListingContract.isInvestorApproved(beneficiary));
        require(validPurchase());

        uint256 weiAmount = msg.value;

        // calculate token amount to be created
        uint256 tokens = weiAmount.mul(rate);

        pendingMints[currentMintNonce] = MintStruct(beneficiary, tokens, weiAmount);
        ContributionRegistered(beneficiary, tokens, weiAmount, currentMintNonce);

        currentMintNonce++;
    }

    function approveMint(uint256 nonce) external onlyValidator returns (bool) {
        require(whiteListingContract.isInvestorApproved(pendingMints[nonce].to));

        // update state
        weiRaised = weiRaised.add(pendingMints[nonce].weiAmount);

        //No need to use mint-approval on token side, since the minting is already approved in the crowdsale side
        token.mint(pendingMints[nonce].to, pendingMints[nonce].tokens);
        
        TokenPurchase(
            msg.sender,
            pendingMints[nonce].to,
            pendingMints[nonce].weiAmount,
            pendingMints[nonce].tokens
        );

        forwardFunds(pendingMints[nonce].weiAmount);
        delete pendingMints[nonce];

        return true;
    }

    function rejectMint(uint256 nonce, uint256 reason) external onlyValidator {
        require(pendingMints[nonce].to != address(0));

        pendingMints[nonce].to.transfer(pendingMints[nonce].weiAmount);
        
        MintRejected(
            pendingMints[nonce].to,
            pendingMints[nonce].tokens,
            pendingMints[nonce].weiAmount,
            nonce,
            reason
        );
        
        delete pendingMints[nonce];
    }

    function setTokenContract(address newToken) external onlyOwner {
        require(newToken != address(0));
        token = CompliantToken(newToken);
    }

    function transferTokenOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0));
        token.transferOwnership(newOwner);
    }

    function forwardFunds(uint256 amount) internal {
        wallet.transfer(amount);
    }
}
