var HDWalletProvider = require("truffle-hdwallet-provider");

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      gas: 4600000,
      network_id: "*" // Match any network id
    },
    ropsten: {
      provider: new HDWalletProvider(process.env.MNEMONIC, "https://ropsten.infura.io/"),
      network_id: "3",
      gas: 4500000,
      gasPrice: 22000000000 // Specified in Wei
    },
  }
};
