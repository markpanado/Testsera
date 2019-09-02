// include testsera
const testsera = require('./testsera')

// get input file
const input_file = process.argv[2]

// process input file
var output = testsera.process(input_file)

// stdout
process.stdout.write(`${output}\n`)

