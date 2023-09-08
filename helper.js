const fs = require('fs')

const writeToFile = (data) => {
  //console.log("server log file", serverlogfilePath)
  const path = './ws.log'

  fs.appendFile(path, data, (err) => {
    if (err) {
      console.log("Error occurred while appending data to file : ", path, err)
    }
  })
}

module.exports = writeToFile