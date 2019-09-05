const fs = require('fs')
const http = require('http')
const fetch = require('node-fetch')

class TestseraAPIs {
    constructor() {
        this.api_map = {}
        this.cash_out_natural_tracker = {
            // user_id as keys
                // week_number
                    // amounts
        }
    }

    // For cash_in transactions
    cash_in_natural(operation) {
        return new Promise(async resolve => {
            const api_name = 'cash_in_natural'
            const api_url = 'http://private-38e18c-uzduotis.apiary-mock.com/config/cash-in'
            const api_data = await this.fetchAPIdata(api_name, api_url)

            const percents = api_data.percents
            const max_amount = api_data.max.amount

            const amount = operation.operation.amount

            // initial commission
            let commission = this.constructor.solveInitialCommission(amount, percents)
            
            // adjust commission and don't exceed max_amount
            commission = this.constructor.adjustCommission(commission > max_amount ? max_amount : commission)

            resolve(commission)
        })
    }

    // For cash_in transactions too. Reusing cash_in_natural
    cash_in_juridical(operation) {
        return this.cash_in_natural(operation)
    }

    // For cash_out transactions and natural user
    cash_out_natural(operation) {
        return new Promise(async resolve => {
            const api_name = 'cash_out_natural'
            const api_url = 'http://private-38e18c-uzduotis.apiary-mock.com/config/cash-out/natural'
            const api_data = await this.fetchAPIdata(api_name, api_url)

            const percents = api_data.percents
            const week_limit = api_data.week_limit.amount

            const date = operation.date
            const user_id = operation.user_id
            const amount = operation.operation.amount

            const week_number = this.constructor.getWeekNumber(date)

            let commission = 0

            // register user id in cash_out_natural_tracker
            if (typeof this.cash_out_natural_tracker[user_id] === 'undefined') this.cash_out_natural_tracker[user_id] = {}

            // register week number if none in cash_out_natural_tracker then set amount to zero
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

                commission = this.constructor.solveInitialCommission(adjusted_amount, percents)
            }

            // return and adjust commission
            commission = this.constructor.adjustCommission(commission)

            resolve(commission)
        })
    }
    
    // For cash_out transaction and juridical user
    cash_out_juridical(operation) {
        return new Promise(async resolve => {
            const api_name = 'cash_out_juridical'
            const api_url = 'http://private-38e18c-uzduotis.apiary-mock.com/config/cash-out/juridical'
            const api_data = await this.fetchAPIdata(api_name, api_url)

            const percents = api_data.percents
            const min_amount = api_data.min.amount

            const amount = operation.operation.amount

            let commission = this.constructor.solveInitialCommission(amount, percents)

            // adjust commission and follow min_amount
            commission = this.constructor.adjustCommission(commission < min_amount ? min_amount : commission)

            resolve(commission)
        })
    }

    // This will fetch the API data usinf node-fetch or from cache
    async fetchAPIdata (api_name, api_url) {
        let api_data = {}

        // check if API response has been cached
        if (typeof this.api_map[api_name] === 'object') {
            // get API data from cache instead to save network request
            api_data = this.api_map[api_name].data
        } else {
            // fetch API data
            const api_response = await fetch(api_url)
            api_data = await api_response.json()
            
            // cache API response to api_map
            this.api_map[api_name] = {
                data: api_data
            }
        }

        return api_data
    }

    // Get week number from a string date | Monday to Sunday
    static getWeekNumber (date_string) {
        const date = new Date(Date.parse(date_string))
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000

        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() - 1) / 7)
    }

    // solve initial commission
    static solveInitialCommission (amount, percents) {
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
}

class Testsera extends TestseraAPIs {
    // init
    constructor() {
        super()
        this.output = []
    }

    // Will solve what method to use for calculating operations
    calculate(operation) {
        // get API map key
        const api_map_key = `${operation.type}_${operation.user_type}`

        // check if api_map_key|operation doesn't exist from TestseraAPIs
        if (typeof this[api_map_key] !== 'function') return `ERR: Operation not found for ${operation.type} ${operation.user_type}`

        // solve operation for:
        //  – cash_in_natural
        //  – cash_out_juridical
        //  – cash_out_natural
        //  – cash_out_juridical
        return new Promise(resolve => {
            resolve(this[api_map_key](operation))
        })
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
                let commission = await this.calculate(operation)
                // store calculations 
                this.output.push(commission)
            }

        } catch (err) {this.output = [err]}

        return this.output.join('\n', ',')
    }
}

module.exports = new Testsera()
