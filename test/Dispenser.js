/*global describe, beforeEach, it, context*/
const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Dispenser", async () => {
    const initialMint = "1" + "0".repeat(26);
    const AddressZero = "0x" + "0".repeat(40);

    let signers;
    let deployer;
    let olas;
    let tokenomics;
    let treasury;
    let dispenser;
    let ve;
    let serviceRegistry;
    let componentRegistry;
    let agentRegistry;
    const epochLen = 1;
    const regDepositFromServices = "1" + "0".repeat(21);
    const twoRegDepositFromServices = "2" + "0".repeat(21);

    // These should not be in beforeEach.
    beforeEach(async () => {
        signers = await ethers.getSigners();
        deployer = signers[0];
        // Note: this is not a real OLAS token, just an ERC20 mock-up
        const olasFactory = await ethers.getContractFactory("ERC20Token");
        olas = await olasFactory.deploy();
        await olas.deployed();

        // Service registry mock
        const ServiceRegistry = await ethers.getContractFactory("MockRegistry");
        serviceRegistry = await ServiceRegistry.deploy();
        await serviceRegistry.deployed();

        // Also deploye component and agent registries
        componentRegistry = await ServiceRegistry.deploy();
        agentRegistry = await ServiceRegistry.deploy();

        // Voting Escrow mock
        const VE = await ethers.getContractFactory("MockVE");
        ve = await VE.deploy();
        await ve.deployed();

        const Dispenser = await ethers.getContractFactory("Dispenser");
        dispenser = await Dispenser.deploy(olas.address, deployer.address);
        await dispenser.deployed();

        const Treasury = await ethers.getContractFactory("Treasury");
        treasury = await Treasury.deploy(olas.address, deployer.address, deployer.address, dispenser.address);
        await treasury.deployed();

        // Treasury address is deployer since there are functions that require treasury only
        const tokenomicsFactory = await ethers.getContractFactory("Tokenomics");
        tokenomics = await tokenomicsFactory.deploy(olas.address, treasury.address, deployer.address, dispenser.address,
            ve.address, epochLen, componentRegistry.address, agentRegistry.address, serviceRegistry.address);

        // Change the tokenomics address in the dispenser to the correct one
        await dispenser.changeTokenomics(tokenomics.address);

        // Update tokenomics address in treasury
        await treasury.changeManagers(AddressZero, AddressZero, tokenomics.address);

        // Mint the initial balance
        await olas.mint(deployer.address, initialMint);

        // Give treasury the minter role
        await olas.changeMinter(treasury.address);
    });

    context("Get rewards", async function () {
        it("Withdraw rewards for unit owners and stakers", async () => {
            // Try to withdraw rewards
            await dispenser.connect(deployer).withdrawOwnerRewards();
            await dispenser.connect(deployer).withdrawStakingRewards();

            // Skip the number of blocks for 2 epochs
            await ethers.provider.send("evm_mine");
            await treasury.connect(deployer).allocateRewards();
            await ethers.provider.send("evm_mine");
            await treasury.connect(deployer).allocateRewards();

            // Calculate staking rewards with zero balances and total supply
            await ve.setBalance(0);
            await ve.setSupply(0);
            await tokenomics.calculateStakingRewards(deployer.address, 1);
            // Set the voting escrow value back
            await ve.setBalance(ethers.utils.parseEther("50"));
            await tokenomics.calculateStakingRewards(deployer.address, 1);
            await ve.setSupply(ethers.utils.parseEther("100"));

            // Send ETH to treasury
            const amount = ethers.utils.parseEther("1000");
            await deployer.sendTransaction({to: treasury.address, value: amount});

            // Lock OLAS balances with Voting Escrow
            await ve.createLock(deployer.address);

            // Change the first service owner to the deployer (same for components and agents)
            await serviceRegistry.changeUnitOwner(1, deployer.address);
            await componentRegistry.changeUnitOwner(1, deployer.address);
            await agentRegistry.changeUnitOwner(1, deployer.address);

            // Whitelist service Ids
            await tokenomics.connect(deployer).changeProtocolServicesWhiteList([1, 2], [true, true]);
            // Send the revenues to services
            await treasury.connect(deployer).depositETHFromServices([1, 2], [regDepositFromServices, regDepositFromServices],
                {value: twoRegDepositFromServices});
            // Start new epoch and calculate tokenomics parameters and rewards
            await treasury.connect(deployer).allocateRewards();

            let result = await tokenomics.getRewardsData();
            expect(result.accountRewards).to.greaterThan(0);
            expect(result.accountTopUps).to.greaterThan(0);

            result = await tokenomics.getOwnerRewards(deployer.address);
            expect(result.reward).to.greaterThan(0);
            expect(result.topUp).to.greaterThan(0);

            // Withdraw rewards
            await dispenser.connect(deployer).withdrawOwnerRewards();
            await dispenser.connect(deployer).withdrawStakingRewards();
        });
    });
});
