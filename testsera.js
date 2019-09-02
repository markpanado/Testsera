const fs = require('fs')
const http = require('http')

class Testsera {
    // init
    constructor() {
        this.output = []

        this.api_map = {
            cash_in: {
                url: 'http://private-38e18c-uzduotis.apiary-mock.com/config/cash-in',
                data: {}
            },
            cash_out_natural: {
                url: 'http://private-38e18c-uzduotis.apiary-mock.com/config/cash-out/natural',
                data: {}
            },
            cash_out_juridical: {
                url: 'http://private-38e18c-uzduotis.apiary-mock.com/config/cash-out/juridical',
                data: {}
            }
        }

        this.cash_out_natural_tracker = {
            // user_id as keys
                // week_number
                    // amounts
        }
    }

    // For cash_in transactions
    cash_in(operation) {
        const api_data = this.api_map.cash_in.data
        const percents = api_data.percents
        const max_amount = api_data.max.amount

        const amount = operation.operation.amount

        let commission = (amount * percents) / 100

        // don't exceed max_amount
        return commission > max_amount ? max_amount : commission
    }

    // For cash_out transactions and natural user
    cash_out_natural(operation) {
        const api_data = this.api_map.cash_out_natural.data
        const percents = api_data.percents
        const week_limit = api_data.week_limit.amount

        const date = operation.date
        const user_id = operation.user_id
        const amount = operation.operation.amount

        const week_number = this.getWeekNumber(date)

        let commission = 0
        
        // register user id if none
        if (typeof this.cash_out_natural_tracker[user_id] === 'undefined') this.cash_out_natural_tracker[user_id] = {}
        
        // register week number if none then set amount to zero
        if (typeof this.cash_out_natural_tracker[user_id][week_number] === 'undefined') this.cash_out_natural_tracker[user_id][week_number] = {
            amount: 0,
            week_limit_deducted: false
        }
        
        // increment weekly transactions
        this.cash_out_natural_tracker[user_id][week_number].amount += amount
        
        // check if weekly transaction reached the limit
        if (this.cash_out_natural_tracker[user_id][week_number].amount > week_limit) {
            let adjusted_amount = amount

            // deduct the limit if reached the first time before solving commission
            if (!this.cash_out_natural_tracker[user_id][week_number].week_limit_deducted) {
                adjusted_amount -= week_limit
                // tag week_limit as reached
                this.cash_out_natural_tracker[user_id][week_number].week_limit_deducted = true
            }

            commission = (adjusted_amount * percents) / 100
        }

        return commission
    }
    
    // For cash_out transaction and juridical user
    cash_out_juridical(operation) {
        const api_data = this.api_map.cash_out_juridical.data
        const percents = api_data.percents
        const min_amount = api_data.min.amount

        const amount = operation.operation.amount

        let commission = (amount * percents) / 100

        // follow min_amount
        return commission < min_amount ? min_amount : commission
    }

    // Init API data
    initAPIdata() {
        // TODO: Make real API calls
        const temp_api_map_data = {
            cash_in: {
                "percents": 0.03,
                "max": {
                    "amount": 5,
                    "currency": "EUR"
                }
            },
            cash_out_natural: {
                "percents": 0.3,
                "week_limit": {
                    "amount": 1000,
                    "currency": "EUR"
                }
            },
            cash_out_juridical: {
                "percents": 0.3,
                "min": {
                    "amount": 0.5,
                    "currency": "EUR"
                }
            }
        }

        Object.keys(this.api_map).map(async (key, index) => {
            this.api_map[key].data = temp_api_map_data[key]
        })
    }

    // Format commission
    adjustCommission(commission) {
        // only adjust numbers
        if (typeof commission === 'string') return commission

        // apply ceiling
        commission = Math.ceil(commission * 100) / 100
        // add 2 decimal places
        commission = parseFloat(commission).toFixed(2)

        return commission
    }

    // Will solve what method to use for calculating operations
    calculate(operation) {
        // get API map key
        const api_map_key = operation.type == 'cash_in' ? operation.type : `${operation.type}_${operation.user_type}`

        // check if operation doesn't exist
        if (typeof this.api_map[api_map_key] === 'undefined') return `ERR: Operation not found for ${operation.type} ${operation.user_type}`

        // solve operation | cash_in | cash_out_natural | cash_out_juridical
        return this[api_map_key](operation)
    }

    // Process input file
    process(input_file) {
        // process data if input file exist
        try {
            // init API data
            this.initAPIdata()

            const data = fs.readFileSync(input_file, 'utf8')
            const operations = JSON.parse(data)

            // process the operations
            operations.forEach(operation => {
                // calculate
                let commission = this.calculate(operation)
                // store calculations with adjustments
                this.output.push(this.adjustCommission(commission))
            });
        } catch (err) {this.output = [err]}
        
        return this.output.join('\n', ',')
    }

    // Get week number from a string date | Monday to Sunday
    getWeekNumber(date_string) {
        const date = new Date(Date.parse(date_string))
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000

        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() - 1) / 7)
    }
}

module.exports = new Testsera()
