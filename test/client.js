const http2 = require("http2");

const client = http2.connect("http://localhost:8000");

client.on("error", err => {
	console.error(err.stack);
});

client.on("connect", async () => {
	const request = (path,method = "GET",data = null) => new Promise((resolve,reject) => {
		let req = client.request({
			":path": path,
			":method": method
		});

		let rtn = {
			headers: null,
			data: ""
		};

		req.on("error", err => {
			reject(err);
		});

		req.on("response", (headers,flags) => {
			rtn.headers = headers;
		});
		
		req.on("data", chunk => {
			rtn.data += chunk.toString();
		});

		req.on("end", () => {
			resolve(rtn);
		});

		if (data != null) {
			req.end(data);
		}
		else {
			req.end();
		}
	});

	const tests = [
		{
			req: ["/"],
			status: 200
		},
		{
			req: ["/","POST"],
			status: 405
		},
		{
			req: ["/root"],
			status: 200
		},
		{
			req: ["/root","POST"],
			status: 200
		},
		{
			req: ["/api"],
			status: 200
		},
		{
			req: ["/api/path"],
			status: 200
		},
		{
			req: ["/id/999"],
			status: 200,
			check: (res) => {
				return {result:res.data === "999", message: `data: ${res.data}`};
			}
		},
		{
			req: ["/id/"],
			status: 200,
			check: (res) => {
				return {result: res.data === "undefined",message: `data: ${res.data}`};
			}
		},
		{
			req: ["/nested/555/"],
			status: 200,
			check: (res) => {
				return {result: res.data === "555,/",message: `data: ${res.data}`};
			}
		},
		{
			req: ["/nested/555/?query=otherstuff"],
			status: 200,
			check: (res) => {
				return {result: res.data === "555,/?query=otherstuff",message: `data: ${res.data}`};
			}
		},
		{
			req: ["/nested/555/other_stuff?query=otherstuff"],
			status: 200
		},
		{
			req: ["/nested/333/query/classes"],
			status: 200,
			check: (res) => {
				return {
					result: res.data === "333,classes",
					message: `data: ${res.data}`
				};
			}
		}
	];

	try {
		let result = null;

		for (let t of tests) {
			result = await request(...t.req);

			console.log("test result");

			let requested_str = `requested: [${t.req.join(",")}] => ${t.status}`;

			if (result.headers[":status"] !== t.status) {
				console.log(`\tfailed request\n\t\t${requested_str}\n\t\trecieved: ${result.headers[":status"]}`);
			}
			else {
				console.log(`\tpassed request\n\t\t${requested_str}`);
			}

			if (t.check != null) {
				let check_result = t.check(result);
				let pass_fail = check_result.result ? "passed" : "failed";

				if (check_result.message != null) {
					console.log(`\t${pass_fail} check: ${check_result.message}`);
				}
				else {
					console.log(`\t${pass_fail} check`);
				}
			}
		}
	} catch (err) {
		console.error(err.stack);
	}

	client.close();
});