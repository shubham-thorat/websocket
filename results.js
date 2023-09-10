const fs = require('fs')

/**
 * Calculates the results of each round. Results include the time elapse and success rate of the processes
 *
 * @type {module.Results}
 */
module.exports = class Results {

    /**
     * Initializes member variables that will be needed by the class
     *
     * @param file_manager {FileManager} Instance of the FileManager class
     * @param request_interval {number} The number of requests to sound out per connected client per round
     * @returns void
     */
    constructor(file_manager, request_interval) {
        /**
         * Instance of the FileManager class
         * @type {FileManager}
         */
        this.file_manager = file_manager;

        /**
         * The number of requests to sound out per connected client per round
         * @type {number}
         */
        this.request_interval = request_interval;
    }

    calculatePercentile(values, percentile) {

        if (values.length === 0) {
            console.error("Latency array is empty")
            return undefined;
        }

        const index = (percentile / 100) * (values.length - 1);

        if (Number.isInteger(index)) {
            return values[index];
        } else {
            const lowerIndex = Math.floor(index);
            const upperIndex = Math.ceil(index);

            const lowerValue = values[lowerIndex];
            const upperValue = values[upperIndex];

            const interpolationFactor = index - lowerIndex;
            return lowerValue + (upperValue - lowerValue) * interpolationFactor;
        }
    }

    /**
     * Calculates various statistics on the data from the round, outputs the statistics to the console, and passes
     * then off to the file manager to be saved.
     *
     * @param stats {Object} An object storing websocket client connections and connection data
     * {
     *      connection_time: {number} the total time it took for all the clients to connect each round
     *      times: {Array}, time data produces by each client for each request to the websocket server
     *      clients: {Array} list of all connected clients
     * }
     * @returns void
     */
    calculate(stats) {

        // the number of clients connected
        let client_length = stats.clients.length;

        // time data produces by each client for each request to the websocket server
        let times = stats.times;

        // the total time it took for all the clients to connect each round
        let connection_time = stats.connection_time;

        // set default values for the start and stop times of the request process
        // these will be used to calculate the total elapsed time to complete the requests
        let start_time = Math.floor(new Date(8640000000000000) / 1000);
        let stop_time = 0;

        // set defaults for the the statistics on round trip times for requests
        let longest_rt = 0;
        let shortest_rt = Number.MAX_SAFE_INTEGER;
        let total_rt = 0;

        // the count of total number to requests that were successful
        let count = 0;
        let latencies = []

        // loop through all the clients that made requests each round
        times.forEach((client_time, key) => {
            // for each client, loop through all the requests the client made
            client_time.forEach(trip => {
                // console.log("startTime : ", trip['start'], "endTIme: ", trip['finish'], " received: ", trip['received'])
                // check if the request completed successfully
                if (trip['start'] !== undefined && trip['received'] !== undefined && trip['finish'] !== undefined) {

                    // determine if the request has the earliest start time
                    if (trip['start'] < start_time) {
                        start_time = trip['start'];
                    }

                    // determine if the request has the latest finish time
                    if (trip['finish'] > stop_time) {
                        stop_time = trip['finish'];
                    }

                    // determine the trips round-trip time
                    let trip_time = trip['finish'] - trip['start'];
                    latencies.push(trip['finish'] - trip['start'])

                    // determine if the trips round-trip time is the longest
                    if (trip_time > longest_rt) {
                        longest_rt = trip_time;
                    }

                    // determine if the trips round-trip time is the shortest
                    if (trip_time < shortest_rt) {
                        shortest_rt = trip_time;
                    }

                    // add the round trip time to the total round-trip time for the round
                    total_rt += trip_time;

                    // add one to the total number of successful requests
                    count++;
                }
            })
        });
        latencies.sort(function (a, b) { return a - b })
        let percent_50 = this.calculatePercentile(latencies, 50)
        let percent_90 = this.calculatePercentile(latencies, 90)
        let percent_99 = this.calculatePercentile(latencies, 99)

        // calculate the average round trip time
        let average_rt = total_rt / count;
        // console.log("stop time: ", stop_time)
        // console.log("start time: ", start_time)
        // calculate the total time for the round
        let time_elapse = stop_time - start_time;

        // output statistics to console
        console.log("Count: " + count + "/" + (this.request_interval * client_length) + " (" + count / (this.request_interval * client_length) * 100 + "%) " + " | Time Elapse: " + time_elapse);
        console.log("Longest Trip: " + longest_rt + " | Shortest Trip: " + shortest_rt + " | Average Trip: " + average_rt);
        const rate = process.env.RATE || 1000
        let data = {
            "clients": client_length,
            "rate": rate,
            "count": count,
            "total": (this.request_interval * client_length),
            "percentage": count / (this.request_interval * client_length) * 100 + "%",
            "time": time_elapse,
            "longest": longest_rt,
            "shortest": shortest_rt,
            "average": average_rt.toFixed(3),
            "connection_time": connection_time,
            "50th_percentile": percent_50.toFixed(3),
            "90th_percentile": percent_90.toFixed(3),
            "99th_percentile": percent_99.toFixed(3)
        };

        console.log("OUTPUT: ", data)

        // send data to the FileManager to be saved
        // this.file_manager.saveDataToFile(data).then(() => {
        //     return new Promise((resolve, reject) => {
        //         resolve();
        //     });
        // });
        const output_file = 'ws_output.json'
        let outputjson = fs.readFileSync(output_file, "utf-8");
        if (outputjson === '') {
            outputjson = '[]'
        }
        let result = JSON.parse(outputjson)
        // console.log("outputFile", result)
        result.push(data)
        fs.writeFileSync(output_file, JSON.stringify(result, null, 2), 'utf-8')

    }
};
