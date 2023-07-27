/*global process*/

const { ethers } = require("hardhat");
const { LedgerSigner } = require("@anders-t/ethers-ledger");
const { fetch } = require("cross-fetch");

async function main() {
    const fs = require("fs");
    const globalsFile = "globals.json";
    const dataFromJSON = fs.readFileSync(globalsFile, "utf8");
    let parsedData = JSON.parse(dataFromJSON);
    const useLedger = parsedData.useLedger;
    const derivationPath = parsedData.derivationPath;
    const providerName = parsedData.providerName;
    let EOA;

    const provider = await ethers.providers.getDefaultProvider(providerName);
    const signers = await ethers.getSigners();

    if (useLedger) {
        EOA = new LedgerSigner(provider, derivationPath);
    } else {
        EOA = signers[0];
    }
    // EOA address
    const deployer = await EOA.getAddress();
    console.log("EOA is:", deployer);

    // Get all the necessary contract addresses
    const depositoryAddress = parsedData.depositoryAddress;
    const tokenomicsProxyAddress = parsedData.tokenomicsProxyAddress;
    const tokenAddress = parsedData.OLAS_ETH_PairAddress;

    // Get the depository instance
    const depository = await ethers.getContractAt("Depository", depositoryAddress);
    const tokenomics = await ethers.getContractAt("Tokenomics", tokenomicsProxyAddress);
    const pair = await ethers.getContractAt("UniswapV2Pair", tokenAddress);

    // Proposal preparation
    console.log("Proposal 3. Calculate LP price for the bonding product");

    // Fetch the ETH price
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    const data = await response.json();
    let priceETH = data.ethereum.usd;

    // Get current LP price
    let priceLP = ethers.BigNumber.from(await depository.getCurrentPriceLP(tokenAddress));

    // Pool supply from the ETH-OLAS contract
    let totalSupply = await pair.totalSupply();
    const reserves = await pair.getReserves();
    let reservesOLAS = reserves._reserve0;
    let reservesETH = reserves._reserve1;
    const e18 = ethers.BigNumber.from("1" + "0".repeat(18));

    // Get the OLAS current price
    const olasPerETH = reservesOLAS.div(reservesETH);
    let priceOLAS = priceETH / Number(olasPerETH);

    // Convert prices in cents
    priceETH = ethers.BigNumber.from(Math.floor(priceETH * 100));
    priceOLAS = ethers.BigNumber.from(Math.floor(priceOLAS * 100));

    // Add liquidity
    //const liquidity = Math.min(amount0.mul(totalSupply) / reservesOLAS, amount1.mul(totalSupply) / reservesETH);
    // add liqudity 1ETH and derivated OLAS as amount0Out = 1ETH * reservesOLAS/reservesETH
    console.log("addLiqudity 2ETH and derivated OLAS based on current reserves");
    const e36 = e18.mul(ethers.BigNumber.from(2));
    const liquidity = e36.mul(totalSupply).div(reservesETH);
    priceLP = (reservesOLAS.mul(e18)).div(totalSupply);
    console.log("before priceLP", priceLP);
    console.log("before totalSupply",totalSupply/10**18);
    console.log("before reservesETH",reservesETH/10**18);
    console.log("before reservesOLAS",reservesOLAS/10**18);
    totalSupply = totalSupply.add(liquidity);
    let newReservesETH = reservesETH.add(e36);
    let newReservesOLAS = reservesOLAS.add(e36.mul(reservesOLAS).div(reservesETH));
    priceLP = (newReservesOLAS.mul(e18)).div(totalSupply);
    console.log("New totalSupply",totalSupply/10**18);
    console.log("new LP tokens",liquidity/10**18);
    console.log("newReservesETH",newReservesETH/10**18);
    console.log("newReservesOLAS",newReservesOLAS/10**18);
    console.log("priceLP", priceLP);
    // fixed after addLiqudity
    reservesETH = newReservesETH;
    reservesOLAS = newReservesOLAS;
    console.log("----------");

    // removeLiqidity
    console.log("removeLiqidity",liquidity);
    const removedOLAS = liquidity.mul(reservesOLAS).div(totalSupply);
    const removedETH = liquidity.mul(reservesETH).div(totalSupply);
    console.log("before totalSupply",totalSupply/10**18);
    totalSupply = totalSupply.sub(liquidity);
    newReservesETH = reservesETH.sub(removedETH);
    newReservesOLAS = reservesOLAS.sub(removedOLAS);
    priceLP = (newReservesOLAS.mul(e18)).div(totalSupply);
    console.log("New totalSupply",totalSupply/10**18);
    console.log("new LP tokens",liquidity/10**18);
    console.log("newReservesETH",newReservesETH/10**18);
    console.log("newReservesOLAS",newReservesOLAS/10**18);
    console.log("priceLP",priceLP);
    // fixed after addLiqudity
    reservesETH = newReservesETH;
    reservesOLAS = newReservesOLAS;
    console.log("----------");

    // swap
    newReservesETH = reservesETH;
    newReservesOLAS = reservesOLAS;
    let priceCompare;

    // We need to iteratively swap by adding 1 ETH into the pool each time such that the price of OLAS increases
    // to the desired value. 4 iterations for 0.16
    for (let i = 0; i < 4; i++) {
        const amountInWithFee = e18.mul(ethers.BigNumber.from(997));
        const numerator = amountInWithFee.mul(reservesOLAS);
        const denominator = reservesETH.mul(ethers.BigNumber.from(1000)).add(amountInWithFee);
        const res = numerator.div(denominator);

        newReservesETH = newReservesETH.add(e18);
        newReservesOLAS = newReservesOLAS.sub(res);

        // This price must match the requested priceOLAS
        priceCompare = (newReservesETH.mul(priceETH)).div(newReservesOLAS);
    }
    priceLP = (newReservesOLAS.mul(e18)).div(totalSupply);
    //console.log("newReservesETH", newReservesETH);
    //console.log("newReservesOLAS", newReservesOLAS);
    //console.log("priceCompare", priceCompare);
    //console.log("priceLP", priceLP);

    // Get effective bond
    const effectiveBond = ethers.BigNumber.from(await tokenomics.effectiveBond());
    // Vesting is 7 days
    const vesting = 3600 * 24 * 7;

    // Price LP for OLAS price of 8, 10, 12, 14, 16 cents
    const pricesLP = ["153231111055529442295", "134525552082932313062", "118937586272434705368", "106467213624036619212", "100232027299837576135"];
    const supplies = ["1000000" + "0".repeat(18), "1000000" + "0".repeat(18), "300000" + "0".repeat(18), "300000" + "0".repeat(18), "300000" + "0".repeat(18)];

    // Final price LP
    const finalPricesLP = new Array(5);
    for (let i = 0; i < 5; i++) {
        priceLP = ethers.BigNumber.from(pricesLP[i]);
        finalPricesLP[i] = priceLP.mul(ethers.BigNumber.from(2));
        console.log("finalPricesLP:", finalPricesLP[i]);
    }

    //console.log("supply", supply);
    //console.log("pricesLP", pricesLP);

    const targets = new Array(5).fill(depositoryAddress);
    const values = new Array(5).fill(0);
    const callDatas = new Array(5);
    for (let i = 0; i < 5; i++) {
        callDatas[i] = depository.interface.encodeFunctionData("create", [tokenAddress, finalPricesLP[i], supplies[i], vesting]);
    }
    const description = "Create OLAS-ETH bonding product";

    // Proposal details
    console.log("targets:", targets);
    console.log("values:", values);
    console.log("call datas:", callDatas);
    console.log("description:", description);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
