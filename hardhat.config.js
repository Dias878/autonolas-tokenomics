require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomiclabs/hardhat-ethers");
require("hardhat-gas-reporter");
require("hardhat-tracer");
// storage layout tool
// require('hardhat-storage-layout');

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const accounts = {
    mnemonic: "test test test test test test test test test test test junk",
    accountsBalance: "100000000000000000000000000000",
};

module.exports = {
    gasReporter: {
        enabled: true
    },
    networks: {
        local: {
            url: "http://localhost:8545",
        },
        hardhat: {
            allowUnlimitedContractSize: true,
            accounts
        },
    },
    solidity: {
        compilers: [
            {
                version: "0.8.18",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 3000,
                    },
                },
            },
            {
                version: "0.5.16", // uniswap
            },
            {
                version: "0.6.6", // uniswap
            }
        ]
    }
};
