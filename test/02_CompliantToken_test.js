import { advanceBlock } from "./helpers/advanceToBlock";
import { increaseTimeTo, duration } from "./helpers/increaseTime";
import latestTime from "./helpers/latestTime";
import log from "./helpers/logger";
import VMExceptionRevert from "./helpers/VMExceptionRevert";

const ApprovedInvestors = artifacts.require("ApprovedInvestors");
const Token = artifacts.require(
  "TransactionApprovalApprovedInvestorTokenWithFeesMock"
);

const BigNumber = web3.BigNumber;
const should = require("chai")
  .use(require("chai-as-promised"))
  .use(require("chai-bignumber")(BigNumber))
  .should();

contract("TransactionApprovalApprovedInvestorTokenWithFees", function([
  owner,
  feeRecipient,
  newFeeRecipient,
  approvedAddress,
  unapprovedAddress,
  validator
]) {
  const tokensForOwner = new BigNumber(1000);
  const allowedTransferAmount = new BigNumber(100);
  const unallowedTransferAmount = new BigNumber(1001);
  const transferFee = new BigNumber(10);

  before(async function() {
    //Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
    await advanceBlock();
  });

  beforeEach(async function() {
    this.whitelisting = await ApprovedInvestors.new();
    this.token = await Token.new(owner, tokensForOwner);

    const tx1 = await this.token.setApprovedInvestorsContract(
      this.whitelisting.address
    );
    log(`setApprovedInvestorsContract gasUsed: ${tx1.receipt.gasUsed}`);

    const tx2 = await this.token.setFee(transferFee);
    log(`setFee gasUsed: ${tx2.receipt.gasUsed}`);

    const tx3 = await this.token.setFeeRecipient(feeRecipient);
    log(`setFeeRecipient gasUsed: ${tx3.receipt.gasUsed}`);

    const tx4 = await this.token.setNewValidator(validator, { from: owner });
    log(`setNewValidator gasUsed: ${tx4.receipt.gasUsed}`);
  });

  it("should be created properly", async function() {
    (await this.token.currentNonce()).should.be.bignumber.equal(
      new BigNumber(0)
    );
    (await this.token.transferFee()).should.be.bignumber.equal(transferFee);
    (await this.token.feeRecipient()).should.equal(feeRecipient);
    (await this.token.whiteListingContract()).should.equal(
      this.whitelisting.address
    );
    (await this.token.balanceOf(owner)).should.be.bignumber.equal(
      tokensForOwner
    );
    (await this.token.totalSupply()).should.be.bignumber.equal(tokensForOwner);
  });

  describe("setApprovedInvestorsContract", function() {
    it("should be able to change whitelisting contract", async function() {
      const newWhitelisting = await ApprovedInvestors.new();

      const { receipt } = await this.token.setApprovedInvestorsContract(
        newWhitelisting.address,
        { from: owner }
      ).should.be.fulfilled;
      log(`setApprovedInvestorsContract gasUsed: ${receipt.gasUsed}`);

      (await this.token.whiteListingContract()).should.equal(
        newWhitelisting.address
      );
    });

    it("should not accept address(0)", async function() {
      await this.token
        .setApprovedInvestorsContract("0x0", { from: owner })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should reject if called by non owner", async function() {
      const newWhitelisting = await ApprovedInvestors.new();

      await this.token
        .setApprovedInvestorsContract(newWhitelisting.address, {
          from: feeRecipient
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should log event", async function() {
      const newWhitelisting = await ApprovedInvestors.new();

      const tx = await this.token.setApprovedInvestorsContract(
        newWhitelisting.address,
        { from: owner }
      ).should.be.fulfilled;
      log(`setApprovedInvestorsContract gasUsed: ${tx.receipt.gasUsed}`);

      const event = tx.logs.find(e => e.event === "WhiteListingContractSet");

      should.exist(event);
      event.args._whiteListingContract.should.equal(newWhitelisting.address);
    });
  });

  describe("setFeeRecipient", function() {
    it("should be able to change fee Recipient", async function() {
      const { receipt } = await this.token.setFeeRecipient(newFeeRecipient, {
        from: owner
      }).should.be.fulfilled;
      log(`setFeeRecipient gasUsed: ${receipt.gasUsed}`);

      (await this.token.feeRecipient()).should.equal(newFeeRecipient);
    });

    it("should not accept address(0)", async function() {
      await this.token
        .setFeeRecipient("0x0", {
          from: owner
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should reject if called by non owner", async function() {
      await this.token
        .setFeeRecipient("0x0", {
          from: feeRecipient
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should log event", async function() {
      const tx = await this.token.setFeeRecipient(newFeeRecipient, {
        from: owner
      }).should.be.fulfilled;
      log(`setFeeRecipient gasUsed: ${tx.receipt.gasUsed}`);

      const event = tx.logs.find(e => e.event === "FeeRecipientSet");

      should.exist(event);
      event.args.previousRecipient.should.equal(feeRecipient);
      event.args.newRecipient.should.equal(newFeeRecipient);
    });
  });

  describe("setFee", function() {
    beforeEach(function() {
      this.newFee = new BigNumber(20);
    });

    it("should be able to change fee", async function() {
      const { receipt } = await this.token.setFee(this.newFee, {
        from: validator
      }).should.be.fulfilled;
      log(`setFee gasUsed: ${receipt.gasUsed}`);

      (await this.token.transferFee()).should.be.bignumber.equal(this.newFee);
    });

    it("should reject if not called by validator", async function() {
      await this.token
        .setFee(this.newFee, {
          from: owner
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should log event", async function() {
      const tx = await this.token.setFee(this.newFee, {
        from: validator
      }).should.be.fulfilled;
      log(`setFee gasUsed: ${tx.receipt.gasUsed}`);

      const event = tx.logs.find(e => e.event === "FeeSet");

      should.exist(event);
      event.args.previousFee.should.be.bignumber.equal(transferFee);
      event.args.newFee.should.be.bignumber.equal(this.newFee);
    });
  });

  describe("transfer", function() {
    beforeEach(async function() {
      const tx1 = await this.whitelisting.approveInvestor(owner, {
        from: owner
      }).should.be.fulfilled;
      log(`approveInvestor for gasUsed: ${tx1.receipt.gasUsed}`);

      const tx2 = await this.whitelisting.approveInvestor(approvedAddress, {
        from: owner
      }).should.be.fulfilled;
      log(`approveInvestor for gasUsed: ${tx2.receipt.gasUsed}`);

      const tx3 = await this.whitelisting.approveInvestor(feeRecipient, {
        from: owner
      }).should.be.fulfilled;
      log(`approveInvestor for gasUsed: ${tx3.receipt.gasUsed}`);
    });

    it("should record pending transactions", async function() {
      const tx1 = await this.token.transfer(
        feeRecipient,
        allowedTransferAmount,
        {
          from: owner
        }
      ).should.be.fulfilled;
      log(`transfer gasUsed: ${tx1.receipt.gasUsed}`);

      const pendingTransaction1 = await this.token.pendingTransactions(0);

      pendingTransaction1[0].should.equal(owner);
      pendingTransaction1[1].should.equal(feeRecipient);
      pendingTransaction1[2].should.be.bignumber.equal(allowedTransferAmount);
      pendingTransaction1[3].should.be.bignumber.equal(transferFee);

      const tx2 = await this.token.approveTransfer(0, {from: validator}).should.be.fulfilled;
      log(`approveTransfer gasUsed: ${tx2.receipt.gasUsed}`);

      const tx3 = await this.token.transfer(
        approvedAddress,
        allowedTransferAmount,
        {
          from: feeRecipient
        }
      ).should.be.fulfilled;
      log(`transfer from fee Reciepient gasUsed: ${tx3.receipt.gasUsed}`);

      const pendingTransaction2 = await this.token.pendingTransactions(1);

      pendingTransaction2[0].should.equal(feeRecipient);
      pendingTransaction2[1].should.equal(approvedAddress);
      pendingTransaction2[2].should.be.bignumber.equal(allowedTransferAmount);
      pendingTransaction2[3].should.be.bignumber.equal(transferFee);
    });

    it("should have an address(0) check", async function() {
      await this.token
        .transfer("0x0", allowedTransferAmount, {
          from: owner
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should revert if sender is not whitelisted", async function() {
      await this.token
        .transfer(approvedAddress, allowedTransferAmount, {
          from: unapprovedAddress
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should revert if reciever is not whitelisted", async function() {
      await this.token
        .transfer(unapprovedAddress, allowedTransferAmount, {
          from: owner
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should revert if transfer value is invalid for normal user", async function() {
      await this.token
        .transfer(approvedAddress, allowedTransferAmount, {
          from: unapprovedAddress
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should revert if transfer value is invalid for fee recipent", async function() {
      await this.token
        .transfer(approvedAddress, allowedTransferAmount, {
          from: feeRecipient
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should increment currentNonce", async function() {
      const tx = await this.token.transfer(
        feeRecipient,
        allowedTransferAmount,
        {
          from: owner
        }
      ).should.be.fulfilled;
      log(`transfer gasUsed: ${tx.receipt.gasUsed}`);

      (await this.token.currentNonce()).should.be.bignumber.equal(
        new BigNumber(1)
      );
    });

    it("should log event", async function() {
      const tx = await this.token.transfer(
        feeRecipient,
        allowedTransferAmount,
        {
          from: owner
        }
      ).should.be.fulfilled;
      log(`transfer gasUsed: ${tx.receipt.gasUsed}`);

      const event = tx.logs.find(e => e.event === "RecordedPendingTransaction");

      should.exist(event);
      event.args.from.should.equal(owner);
      event.args.to.should.equal(feeRecipient);
      event.args.value.should.be.bignumber.equal(allowedTransferAmount);
      event.args.fee.should.be.bignumber.equal(transferFee);
    });
  });

  describe("approveTransfer", function() {
    beforeEach(async function() {
      const tx1 = await this.whitelisting.approveInvestor(owner, {
        from: owner
      }).should.be.fulfilled;
      log(`approveInvestor for gasUsed: ${tx1.receipt.gasUsed}`);

      const tx2 = await this.whitelisting.approveInvestor(approvedAddress, {
        from: owner
      }).should.be.fulfilled;
      log(`approveInvestor for gasUsed: ${tx2.receipt.gasUsed}`);

      const tx3 = await this.whitelisting.approveInvestor(feeRecipient, {
        from: owner
      }).should.be.fulfilled;
      log(`approveInvestor for gasUsed: ${tx3.receipt.gasUsed}`);

      const tx4 = await this.token.transfer(
        approvedAddress,
        allowedTransferAmount,
        {
          from: owner
        }
      ).should.be.fulfilled;
      log(`transfer gasUsed: ${tx4.receipt.gasUsed}`);
    });

    it("should complete pending transactions", async function() {
      const tx = await this.token.approveTransfer(0, { from: validator }).should
        .be.fulfilled;
      log(`approveTransfer gasUsed: ${tx.receipt.gasUsed}`);
    });

    it("should delete pending transactions after completing them", async function() {
      const tx = await this.token.approveTransfer(0, { from: validator }).should
        .be.fulfilled;
      log(`approveTransfer gasUsed: ${tx.receipt.gasUsed}`);

      const pendingTransaction = await this.token.pendingTransactions(0);

      pendingTransaction[0].should.equal(
        "0x0000000000000000000000000000000000000000"
      );
      pendingTransaction[1].should.equal(
        "0x0000000000000000000000000000000000000000"
      );
      pendingTransaction[2].should.be.bignumber.equal(new BigNumber(0));
      pendingTransaction[3].should.be.bignumber.equal(new BigNumber(0));
    });

    it("should increment balance of reciever", async function() {
      const tx = await this.token.approveTransfer(0, { from: validator }).should
        .be.fulfilled;
      log(`approveTransfer gasUsed: ${tx.receipt.gasUsed}`);

      (await this.token.balanceOf(approvedAddress)).should.be.bignumber.equal(
        allowedTransferAmount
      );
    });

    it("should transfer fee to fee recipent", async function() {
      const tx = await this.token.approveTransfer(0, { from: validator }).should
        .be.fulfilled;
      log(`approveTransfer gasUsed: ${tx.receipt.gasUsed}`);

      (await this.token.balanceOf(feeRecipient)).should.be.bignumber.equal(
        transferFee
      );
    });

    it("should revert if not called by validator", async function() {
      await this.token
        .approveTransfer(0, {
          from: owner
        })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should not approve non existing transactions", async function() {
      await this.token
        .approveTransfer(1, { from: validator })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should reject transactions with non whitelisted sender", async function() {
      await this.whitelisting.disapproveInvestor(owner);
      await this.token
        .approveTransfer(0, { from: validator })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should reject transactions with non whitelisted reciever", async function() {
      await this.whitelisting.disapproveInvestor(approvedAddress);
      await this.token
        .approveTransfer(0, { from: validator })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should not deduct transfer fee from fee recipent", async function() {
      const tx1 = await this.token.transfer(
        feeRecipient,
        allowedTransferAmount,
        {
          from: owner
        }
      ).should.be.fulfilled;
      log(`transfer gasUsed: ${tx1.receipt.gasUsed}`);

      const tx2 = await this.token.approveTransfer(1, { from: validator })
        .should.be.fulfilled;
      log(`approveTransfer gasUsed: ${tx2.receipt.gasUsed}`);

      const tx3 = await this.token.transfer(
        approvedAddress,
        allowedTransferAmount,
        {
          from: feeRecipient
        }
      ).should.be.fulfilled;
      log(`transfer gasUsed: ${tx3.receipt.gasUsed}`);

      const balanceBefore = await this.token.balanceOf(feeRecipient);

      const tx4 = await this.token.approveTransfer(2, { from: validator })
        .should.be.fulfilled;
      log(`approveTransfer gasUsed: ${tx4.receipt.gasUsed}`);

      const balanceAfter = await this.token.balanceOf(feeRecipient);

      balanceBefore
        .sub(balanceAfter)
        .should.be.bignumber.equal(allowedTransferAmount);
    });

    it("should log event", async function() {
      const tx = await this.token.approveTransfer(0, { from: validator }).should
        .be.fulfilled;
      log(`approveTransfer gasUsed: ${tx.receipt.gasUsed}`);

      const event1 = tx.logs.find(e => e.event === "Transfer");

      should.exist(event1);
      event1.args.from.should.equal(owner);
      event1.args.to.should.equal(approvedAddress);
      event1.args.value.should.be.bignumber.equal(allowedTransferAmount);

      const event2 = tx.logs.find(e => e.event === "TransferWithFee");

      should.exist(event2);
      event2.args.from.should.equal(owner);
      event2.args.to.should.equal(approvedAddress);
      event2.args.value.should.be.bignumber.equal(allowedTransferAmount);
      event2.args.fee.should.be.bignumber.equal(transferFee);
    });
  });

  describe("rejectTransfer", function() {
    beforeEach(async function() {
      const tx1 = await this.whitelisting.approveInvestor(owner, {
        from: owner
      }).should.be.fulfilled;
      log(`approveInvestor for gasUsed: ${tx1.receipt.gasUsed}`);

      const tx2 = await this.whitelisting.approveInvestor(approvedAddress, {
        from: owner
      }).should.be.fulfilled;
      log(`approveInvestor for gasUsed: ${tx2.receipt.gasUsed}`);

      const tx3 = await this.token.transfer(
        approvedAddress,
        allowedTransferAmount,
        {
          from: owner
        }
      ).should.be.fulfilled;
      log(`transfer gasUsed: ${tx3.receipt.gasUsed}`);
    });

    it("should be able to delete pending transactions", async function() {
      this.reason = new BigNumber(1);
      const tx = await this.token.rejectTransfer(0, this.reason, {
        from: validator
      }).should.be.fulfilled;
      log(`rejectTransfer gasUsed: ${tx.receipt.gasUsed}`);

      const pendingTransaction = await this.token.pendingTransactions(0);

      pendingTransaction[0].should.equal(
        "0x0000000000000000000000000000000000000000"
      );
      pendingTransaction[1].should.equal(
        "0x0000000000000000000000000000000000000000"
      );
      pendingTransaction[2].should.be.bignumber.equal(new BigNumber(0));
      pendingTransaction[3].should.be.bignumber.equal(new BigNumber(0));
    });

    it("should revert if called for non existing transfers", async function() {
      await this.token
        .rejectTransfer(1, this.reason, { from: validator })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should reject if not called by validator", async function() {
      await this.token
        .rejectTransfer(0, this.reason, { from: feeRecipient })
        .should.be.rejectedWith(VMExceptionRevert);
    });

    it("should log event", async function() {
      const tx = await this.token.rejectTransfer(0, this.reason, {
        from: validator
      }).should.be.fulfilled;
      log(`rejectTransfer gasUsed: ${tx.receipt.gasUsed}`);

      const event = tx.logs.find(e => e.event === "TransferRejected");

      should.exist(event);
      event.args.from.should.equal(owner);
      event.args.to.should.equal(approvedAddress);
      event.args.value.should.be.bignumber.equal(allowedTransferAmount);
      event.args.nonce.should.be.bignumber.equal(new BigNumber(0));
      event.args.reason.should.be.bignumber.equal(this.reason);
    });
  });
});
