require("ts-node/register");

module.exports = {
  test_file_extension_regexp: /.*\.ts$/,
  networks: {
    test: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    }
  },
  compilers: {
    solc: {
      version: "0.6.8",
      docker: true,
    }
  }
};
