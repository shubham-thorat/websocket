const WebSocketClient = require('websocket').client
const WebSocket = require('ws').WebSocket;
const clientstatsd = require('./statsD')
const sleep = require('./sleep')
const writeToFile = require('./helper')
const sp = require('./schemapack');
require('dotenv').config()


const playerSchema = sp.build({
    c: 'uint32',
    ts: 'string',
    txnTyp: 'string',
    exch: 'string',
    qty: 'uint32',
    sym: 'string',
    prc: 'float32',
    odTyp: 'string',
    tag: 'string',
    source: 'string',
    mktType: 'string',
    val: 'string',
    segmt: 'string',
    trprc: 'float32',
    var: 'string',
    pdt: 'string',
    disqty: 'int16',
    tarprc: 'float32'
})



module.exports = class Connection {

    /**
     * Initializes all the data that will be needed to create and use the websocket client
     *
     * @param benchmark_obj {Object} An object storing data that each client will need to connect to the benchmark
     *      server, and send requests
     * @param connection_progress_obj {Object} An object storing data on the connections currently being made each round
     * @param benchmark_progress_obj {Object} An object storing data on all the requests currently being made each round
     * @returns void
     */
    constructor(benchmark_obj, connection_progress_obj, benchmark_progress_obj) {

        /**
         * Signifies whether the connection should be kept alive, and therefore reconnected if closed
         * @type {boolean}
         */
        this.keep_alive = true;

        /**
         * Client connection to the websocket server
         * @type {WebSocketClient}
         */
        this.client = null;

        /**
         * List of requests made for the round for this client with the requests corresponding timestamps
         * @type {Array}
         */
        this.times = [];

        /**
         * The number of connections that have failed
         * @type {number}
         */
        this.connection_fails = 0;

        /**
         * The number of errors that have occurred
         * @type {number}
         */
        this.connection_errors = 0;

        /**
         * The number of successfully completed requests for a given round
         * @type {number}
         */
        this.count = 0;

        /**
         * An array storing the last 20 count readings
         * @type {Array}
         */
        this.last_count = new Array(20);

        /**
         * An object storing data that each client will need to connect to the benchmark server, and send requests
         * {
         *      websocket_address {string} IP address of the websocket server to connect to
         *      websocket_port: {number} Port number of the websocket to connect to
         *      connection_interval: {number} The number of websocket connections to add each round
         *      request_interval: {number} The number of requests to sound out per connected client per round
         *      request_timeout: {number} The number of minutes to wait before abandoning a request
         * }
         * @type {Object}
         */
        this.benchmark_obj = benchmark_obj;

        /**
         * An object storing data on the connections currently being made each round
         * {
         *      counter: {number} the number of clients currently created each round,
         *      total: {number} the total number of clients expected to me created each round,
         *      message: {string} the message to output before starting the connection process
         * }
         * @type {Object}
         */
        this.connection_progress_obj = connection_progress_obj;

        /**
         * An object storing data on all the requests currently being made each round
         * {
         *      counter: {number} the number of requests currently completed each round,
         *      total: {number} the total number of requests expected to me completed each round,
         *      message: {string} the message to output before starting the benchmarking process
         * }
         * @type {Object}
         */
        this.benchmark_progress_obj = benchmark_progress_obj;

        // redefine the push function for the last_count array to shift the data with each entry
        this.last_count.push = function () {
            if (this.length >= 20) {
                this.shift();
            }
            return Array.prototype.push.apply(this, arguments);
        };
    }

    /**
     * Sends the requests from the websocket clients to the server
     *
     * @returns {Promise} resolves once all requests have been completed, or the process times out
     */
    sendData(clientIdx) {

        // track the number of successful requests
        this.count = 0;

        // empty array which will hold timestamp data for each request made
        this.times = [];

        return new Promise((resolve, reject) => {
            // console.log("REQUEST_INTERVAL: ", this.benchmark_obj.request_interval)
            // writeToFile(`\nTOTAL_REQUEST PER CLIENT : ${this.benchmark_obj.request_interval}`)
            // send a total number of requests equal to the specified request interval
            let rps = process.env.RATE || 1000
            let remaining = this.benchmark_obj.request_interval % rps
            let rounds = Math.ceil((this.benchmark_obj.request_interval * 20) / rps)
            // console.log("TOTAL ROUNDS : ", rounds)
            let round_no = 0
            let cnt = 0;
            const finish2 = setInterval(() => {
                // writeToFile(`INSIDE SETINTERVAL : client : ${clientIdx} round: ${round_no}`)
                round_no += 1
                // console.log("ROUND NO : ", round_no)
                let N = rps / 20
                // let N = this.benchmark_obj.request_interval

                // writeToFile(`EXECUTING ROUND: ${round_no} CLIENT_NO: ${clientIdx}\n`)
                for (let i = 0; i < N; i++) {
                    cnt += 1
                    // console.log("ROUND: ", round_no, "INDEX: ", i)
                    // ensure the connection is defines before sending, otherwise resolve
                    if (this.connection !== undefined) {
                        // set the starting timestamp for the request to now
                        this.times[cnt] = { 'start': Date.now() };
                        clientstatsd.timing('request_send', 1)
                        const data = {
                            'c': cnt,
                            'ts': '0',
                            'txnTyp': 'B',
                            'exch': 'NSE',
                            'qty': 1000,
                            'sym': 'IDBI',
                            'prc': 1011.46,
                            'odTyp': 'L',
                            'tag': 'Sample',
                            'source': 'M',
                            'mktType': 'N',
                            'val': 'IOC',
                            'segmt': 'E',
                            'trprc': 1022.56,
                            'var': 'AMO',
                            'pdt': 'CNC',
                            'disqty': 100,
                            'tarprc': 1100.03
                        }
                        let buffer = playerSchema.encode(data)
                        // console.log("buffer : ", buffer)
                        // create a JSON string containing the current request number

                        // let data = JSON.stringify({
                        //     'message_count': cnt,
                        //     'key': 'websocket_key',
                        //     'value': 'websocket_value',
                        //     // 'extras': {
                        //     //     'random': extraData
                        //     // }
                        // });

                        // console.log(`SENDING REQUEST CLIENT_NO: ${clientIdx} REQUEST_NO: ${i}`)
                        // writeToFile(`SENDING REQUEST CLIENT_NO: ${clientIdx} ROUND: ${round_no} REQUEST_NO: ${i}\n`)

                        // send the request to the websocket server
                        this.connection.sendUTF(buffer);

                    } else {
                        // console.log("ENTER INSIDE RESOLVE")
                        resolve();
                    }
                    // console.log("INSIDE ", round_no, " ", i)
                    // if the request being sent is that last in the loop..
                    // console.log("TOTAL: ", rounds, " ROUND NO:", round_no, "INDEX : ", i, " N", N)
                    // writeToFile(`ROUNDNO: ${round_no} ind: ${i}`)
                    if (round_no === rounds && i === N - 1) {
                        // console.log("INSIDE ROUND")
                        // if (i === this.benchmark_obj.request_interval - 1) {
                        // console.log("INSIDE FOR LOOP")
                        writeToFile(`\nLAST ROUND : ${round_no}\n`)
                        const self = this;
                        var timer = 0;

                        // clearInterval(finish)
                        // resolve()

                        // ... check once per second if the function should resolve
                        const finishCount = setInterval(function () {

                            //     // The function should resolve if:
                            //     // 1. There are no requests with a "finish" index which is undefined
                            let readyToResolve = self.times.every(function (time, message_index) {
                                return time['finish'] !== undefined;
                            });

                            //     // 2. The count tracker of successful requests is equal to the number of requests sent
                            //     // 3. The number of successful requests is the same as the number of successful requests from
                            //     //    20 seconds ago AND more than 90% of requests were successful or the request process has
                            //     //    been running for 5 minutes
                            if (readyToResolve
                                || ((self.count / self.benchmark_obj.request_interval) === 1)
                                || (self.count === self.last_count[0]
                                    && (((self.count / self.benchmark_obj.request_interval) > .9)
                                        || (timer++ >= 100)
                                    ))) {

                                // stop checking if the request process has finished, and resolve with the times array
                                clearInterval(finishCount);
                                // console.log(`RESOLVING FOR CLIENT ${clientIdx}`)
                                resolve(self.times);
                                clearInterval(finish2)
                            }

                            //     console.log(`INSIDE SET INTERVAL ${clientIdx}`)
                            //     // Track the count of successful request.
                            //     // The array stores the last 20 checks (20 seconds).
                            //     // If the number of successful requests is not changing, we can assume no more
                            //     // will be coming in.
                            self.last_count.push(self.count);

                        }, 1000);
                        clearInterval(finish2)
                        // }
                    }

                }
                // if (round_no === rounds) {
                //     clearInterval(finish)
                // }
            }, 50);
            // }, 1000);

            // sleep.sleep(1)
        });
    }

    /**
     * Sets up a connection to the websocket server
     * and defines event actions
     *
     * @returns {Promise} resolves once connected
     */
    connect() {
        return new Promise((resolve, reject) => {

            // allows this to be used inside nested functions
            const self = this;
            let url = "ws://"+this.benchmark_obj.websocket_address+":"+this.benchmark_obj.websocket_port;
            // initialize websocket client
            // this.client = new WebSocketClient();
            this.times[0] = { 'start': Date.now() };
            this.client = new WebSocket(url, { perMessageDeflate: false });
            
            /**
             *
             * WEBSOCKET CLIENT EVENT FUNCTION
             *
             */

            /**
             * Failed Connection Event
             */
            this.client.on('connectFailed', function (error) {

                // increment failed connection tracker by 1
                self.connection_fails++;

                // retry connection (wrapped in an async function)
                let connect = async function () { self.connect(); };
                connect().then(() => {
                    //self.connection_progress_obj.counter++;
                    resolve();
                });
            });

            /**
             * Successful Connection Event
             */
            this.client.on('open', function () {
                // let connection = this.client
                // assign connection variable to member property
                // self.connection = connection;

                // increment connection counter by 1
                self.connection_progress_obj.counter++;

                // start heartbeat to keep connection alive
                self.ping();

                /**
                 * Connection Error Event
                 */
                this.client.on('error', function (error) {

                    // increment error tacker by 1
                    self.connection_errors++;
                    self.connection_progress_obj.counter--;
                    //console.log("Connection Error: " + error.toString());

                    // try to reconnect
                    self.connect();
                });

                /**
                 * Message Received Event
                 */
                connection.on('message', function (message) {
                    clientstatsd.timing('response_received', 1)
                    console.log("MESSAGE", message)
                    // convert the incoming JSON string to an Object
                    let data = JSON.parse(message.utf8Data);
                    // writeToFile(`RESPONSE RECEIVED : ${data['message_count']} \n`)
                    // console.log("DATA RECEIVED : ", data)
                    // ensure incoming message has an already existing corresponding request in the times array
                    if (self.times[data['c']] !== undefined) {

                        // ensure the corresponding request in the times array does not already contain any data from
                        // the websocket server.
                        // This can happen if the server sends the 0 response twice, once when the client connects,
                        // and again each round. For the sake of simple math, we just keep the first one.
                        if (self.times[data['c']]['received'] === undefined
                            && self.times[data['c']]['finish'] === undefined) {

                            // store the corresponding timestamps in the times array
                            self.times[data['c']]['received'] = data['received_time'];
                            self.times[data['c']]['finish'] = Date.now();
                            // console.log("START TIME: ", self.times[data['message_count']]['start'])
                            // console.log("RECEIVED TIME: ", self.times[data['message_count']]['received'])
                            // console.log("FINISH TIME: ", self.times[data['message_count']]['finish'])
                            clientstatsd.timing('response_time', self.times[data['c']]['finish'] - self.times[data['c']]['start'])

                            clientstatsd.timing('client_to_server_time', self.times[data['c']]['received'] - self.times[data['c']]['start'])
                            clientstatsd.timing('server_to_client_time', self.times[data['c']]['finish'] - self.times[data['c']]['received'])
                            // increment the successful request counters by 1
                            self.benchmark_progress_obj.counter++;
                            self.count++;

                        }
                    }
                });

                /**
                 * Connection Close Event
                 */
                connection.on('close', function () {
                    self.connection_progress_obj.counter--;
                    if (self.keep_alive) {
                        self.connect();
                    }
                });



                /**
                 *
                 * END OF WEBSOCKET CLIENT EVENT FUNCTION
                 *
                 */

                resolve();
            });

            // define the websocket server url. Ex: ws://127.0.0.1:8080
            // let url = "ws://" + this.benchmark_obj.websocket_address + ":" + this.benchmark_obj.websocket_port;

            // set the first timestamp request in the times array to now, as we will be expecting a response from the
            // server once connected
            

            // connect to the websocket server
            // this.client.connect(url);

        });
    }

    /**
     * Pings the server at a regular interval.
     * Websockets require a "heartbeat" in order to keep the conneciton open.
     * @returns {void}
     */
    ping() {

        // allows this to be used inside nested functions
        let self = this

        // send a request to the websocket server ever 5 seconds
        this.pingTimer = setInterval(function () {

            // create a JSON string containing the current request number
            // we use 0 as to not interer with any unsigned ints on the server end, as well as any possible
            // pening responses from the server
            let data = JSON.stringify({ 'message_count': 0 });

            // send the request to the websocket server
            self.connection.sendUTF(data);

        }, 5000);
    }

    /**
     * Closes the connection to the websocket server
     * @returns {void}
     */
    close() {
        this.keep_alive = false;
        clearInterval(this.pingTimer);
        this.connection.close();
    }
};
