pragma solidity ^0.4.18;

import "../zeppelin-solidity/contracts/token/ERC20/MintableToken.sol";
import "./utility/Validator.sol";
import "./WhitelistContract.sol";


contract CompliantToken is Validator, MintableToken {
    Whitelist public whiteListingContract;

    struct TransactionStruct {
        address from;
        address to;
        uint256 value;
        uint256 fee;
        bool isTransferFrom;
    }

    mapping (uint => TransactionStruct) public pendingTransactions;
    uint256 public currentNonce = 0;
    uint256 public transferFee;
    address public feeRecipient;    

    event TransferRejected(
        address indexed from,
        address indexed to,
        uint256 value,
        uint256 indexed nonce,
        uint256 reason
    );

    event TransferWithFee(
        address indexed from,
        address indexed to,
        uint256 value,
        uint256 fee
    );

    event RecordedPendingTransaction(
        address indexed from,
        address indexed to,
        uint256 value,
        uint256 fee,
        bool isTransferFrom
    );

    event WhiteListingContractSet(address indexed _whiteListingContract);

    event FeeSet(uint256 indexed previousFee, uint256 indexed newFee);

    event FeeRecipientSet(address indexed previousRecipient, address indexed newRecipient);

    function setWhitelistContract(address reference) public onlyValidator {
        require(reference != address(0));
        whiteListingContract = Whitelist(reference);
        WhiteListingContractSet(whiteListingContract);
    }

    function setFee(uint256 fee) public onlyValidator {
        FeeSet(transferFee, fee);
        transferFee = fee;
    }

    function setFeeRecipient(address recipient) public onlyValidator {
        require(recipient != address(0));
        FeeRecipientSet(feeRecipient, recipient);
        feeRecipient = recipient;
    }

    function transfer(address _to, uint256 _value) public returns (bool) {
        require(_to != address(0));
        require(_value > 0);
        require(whiteListingContract.isInvestorApproved(msg.sender));
        require(whiteListingContract.isInvestorApproved(_to));

        (msg.sender == feeRecipient) ? 
            require(_value <= balances[msg.sender]) : 
            require(_value.add(transferFee) <= balances[msg.sender]);

        pendingTransactions[currentNonce] = TransactionStruct(
            msg.sender,
            _to,
            _value,
            transferFee,
            false
        );

        RecordedPendingTransaction(msg.sender, _to, _value, transferFee, false);
        currentNonce++;

        return true;
    }

    function approveTransfer(uint256 nonce) public onlyValidator returns (bool) {
        require(pendingTransactions[nonce].to != address(0));
        require(whiteListingContract.isInvestorApproved(pendingTransactions[nonce].from));
        require(whiteListingContract.isInvestorApproved(pendingTransactions[nonce].to));

        if (pendingTransactions[nonce].from == feeRecipient) {
            balances[pendingTransactions[nonce].from] = balances[pendingTransactions[nonce].from]
                .sub(pendingTransactions[nonce].value);
            balances[pendingTransactions[nonce].to] = balances[pendingTransactions[nonce].to]
                .add(pendingTransactions[nonce].value);
            
            Transfer(
                pendingTransactions[nonce].from,
                pendingTransactions[nonce].to,
                pendingTransactions[nonce].value
            );
            
            TransferWithFee(
                pendingTransactions[nonce].from,
                pendingTransactions[nonce].to,
                pendingTransactions[nonce].value,
                0
            );
        } else {
            balances[pendingTransactions[nonce].from] = balances[pendingTransactions[nonce].from]
                .sub(pendingTransactions[nonce].value.add(pendingTransactions[nonce].fee));
            balances[pendingTransactions[nonce].to] = balances[pendingTransactions[nonce].to]
                .add(pendingTransactions[nonce].value);
            balances[feeRecipient] = balances[feeRecipient].add(pendingTransactions[nonce].fee);
            
            Transfer(
                pendingTransactions[nonce].from,
                pendingTransactions[nonce].to,
                pendingTransactions[nonce].value
            );

            TransferWithFee(
                pendingTransactions[nonce].from,
                pendingTransactions[nonce].to,
                pendingTransactions[nonce].value,
                pendingTransactions[nonce].fee
            );
        }

        delete pendingTransactions[nonce];
        return true;
    }

    function rejectTransfer(uint256 nonce, uint256 reason) public onlyValidator {
        require(pendingTransactions[nonce].to != address(0));

        TransferRejected(
            pendingTransactions[nonce].from,
            pendingTransactions[nonce].to,
            pendingTransactions[nonce].value,
            nonce,
            reason
        );
        
        delete pendingTransactions[nonce];
    }
}
