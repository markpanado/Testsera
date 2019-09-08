const fs = require('fs')
const fetch = require('node-fetch')

// Static utitly functions
class Utilities {
    // Get week number from a string date | Monday to Sunday
    static getWeekNumber (date_string) {
        const date = new Date(Date.parse(date_string))
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000

        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() - 1) / 7)
    }

    // solve initial commission
    static solveCommission (amount, percents) {
        return (amount * percents) / 100
    }

    // Format commission
    static adjustCommission(commission) {
        // only adjust numbers
        if (typeof commission === 'string') return commission

        // apply ceiling
        commission = Math.ceil(commission * 100) / 100
        // add 2 decimal places
        commission = parseFloat(commission).toFixed(2)

        return commission
    }

    // Get api_map_key for operations
    static getAPIMapKey(operation) {
        return `${operation.type}_${operation.user_type}`
    }

    // Check if given operation is valid
    static operationExist(api_map, operation) {
        return !(typeof api_map[this.getAPIMapKey(operation)] === 'undefined')
    }

    // Solve operation
    static solveOperation(parent, operation) {
        return parent[parent.api_map[this.getAPIMapKey(operation)].method_name](operation)
    }

    // This will fetch the API data using node-fetch or from cache
    static async fetchAPIdata (api_map, operation) {
        const api_map_key = api_map[this.getAPIMapKey(operation)].method_name
        const api_url = api_map[api_map_key].url
        
        let api_data = {}
        
        // check if API response has been fetched
        if (Object.keys(api_map[api_map_key].data).length) {
            // get API data from cache instead to save network request
            api_data = api_map[api_map_key].data
        } else {
            // fetch API data
            const api_response = await fetch(api_url)
            api_data = await api_response.json()
            
            console.log(api_data)

            // cache API response to api_map
            api_map[api_map_key].data = api_data
        }

        return api_data
    }

    // Will solve what method to use for calculating operations
    static calculate(parent, operation) {
        // check if operation doesn't exist in map
        if (!this.operationExist(parent.api_map, operation)) return `ERR: Operation not found for ${Utilities.getAPIMapKey(operation)}`

        // solve operation for:
        //  – cash_in_natural
        //  – cash_out_juridical
        //  – cash_out_natural
        //  – cash_out_juridical
        return new Promise(resolve => {
            resolve(this.solveOperation(parent, operation))
        })
    }
}

// Functions for solving operations
class Operations extends Utilities {
    constructor() {
        super()

        this.api_map = {
            cash_in_natural: {
                method_name: 'cash_in_natural',
                url: 'http://private-38e18c-uzduotis.apiary-mock.com/config/cash-in',
                data: {}
            },
            cash_in_juridical: {
                method_name: 'cash_in_natural'
            },
            cash_out_natural: {
                method_name: 'cash_out_natural',
                url: 'http://private-38e18c-uzduotis.apiary-mock.com/config/cash-out/natural',
                data: {},
                tracker: {}
            },
            cash_out_juridical: {
                method_name: 'cash_out_juridical',
                url: 'http://private-38e18c-uzduotis.apiary-mock.com/config/cash-out/juridical',
                data: {},
                tracker: {
                    // user_id as keys
                        // week_number  
                            // amounts
                }
            }
        }
    }

    // For cash_in transactions
    cash_in_natural(operation) {
        return new Promise(async resolve => {
            const api_data = await Utilities.fetchAPIdata(this.api_map, operation)

            const percents = api_data.percents
            const max_amount = api_data.max.amount

            const amount = operation.operation.amount

            // initial commission
            let commission = Utilities.solveCommission(amount, percents)
            
            // adjust commission and don't exceed max_amount
            commission = Utilities.adjustCommission(commission > max_amount ? max_amount : commission)

            resolve(commission)
        })
    }

    // For cash_out transactions and natural user
    cash_out_natural(operation) {
        return new Promise(async resolve => {
            const api_data = await Utilities.fetchAPIdata(this.api_map, operation)

            const percents = api_data.percents
            const week_limit = api_data.week_limit.amount

            const user_id = operation.user_id
            const amount = operation.operation.amount

            const week_number = Utilities.getWeekNumber(operation.date)
            
            const tracker = this.api_map[Utilities.getAPIMapKey(operation)].tracker

            let commission = 0

            // register user id in cash_out_natural_tracker
            if (typeof tracker[user_id] === 'undefined') tracker[user_id] = {}

            // register week number if none in cash_out_natural_tracker then set amount to zero
            if (typeof tracker[user_id][week_number] === 'undefined') tracker[user_id][week_number] = {
                amount: 0,
                week_limit_deducted: false
            }

            // increment weekly transactions
            tracker[user_id][week_number].amount += amount

            // check if weekly transaction reached the limit
            if (tracker[user_id][week_number].amount > week_limit) {
                let adjusted_amount = amount

                // deduct the limit if reached the first time before solving commission
                if (!tracker[user_id][week_number].week_limit_deducted) {
                    adjusted_amount -= week_limit
                    // tag week_limit as reached
                    tracker[user_id][week_number].week_limit_deducted = true
                }

                commission = Utilities.solveCommission(adjusted_amount, percents)
            }

            // return and adjust commission
            commission = Utilities.adjustCommission(commission)

            resolve(commission)
        })
    }
    
    // For cash_out transaction and juridical user
    cash_out_juridical(operation) {
        return new Promise(async resolve => {
            const api_data = await Utilities.fetchAPIdata(this.api_map, operation)

            const percents = api_data.percents
            const min_amount = api_data.min.amount

            const amount = operation.operation.amount

            let commission = Utilities.solveCommission(amount, percents)

            // adjust commission and follow min_amount
            commission = Utilities.adjustCommission(commission < min_amount ? min_amount : commission)

            resolve(commission)
        })
    }
}

class Processor extends Operations {
    // init
    constructor() {
        super()
        this.output = []
    }

    // Process input file
    async process(input_file) {
        // process data if input file exist
        try {
            const data = fs.readFileSync(input_file, 'utf8')
            const operations = JSON.parse(data)

            // process the operations
            for (const operation of operations) {
                // calculate
                let commission = await Utilities.calculate(this, operation)
                // store calculations 
                this.output.push(commission)
            }

        } catch (err) {this.output = [err]}

        return this.output.join('\n', ',')
    }
}

module.exports = new Processor()



