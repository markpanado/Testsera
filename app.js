// include testsera
const testsera = require('./testsera')

// get input file
const input_file = process.argv[2]

// process input file
testsera.process(input_file).then(output => {
    // stdout
    process.stdout.write(`${output}\n`)
})
