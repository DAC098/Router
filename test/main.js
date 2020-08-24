const http2 = require("http2");

function resStream(stream, status, message = "okay") {
	stream.respond({
		":status": status,
		"content-type": "text/plain"
	});
	stream.end(message);
}

async function main() {
	const Router = (await import("../dist/Router.js")).default;
	const router = new Router();

	router.addRoute({
		path: "/",
		methods: "get"
	},(stream, headers, flags, route_data) => {
		resStream(stream,200);
	});

	router.addRoute({
		path: "/root",
		methods: ["get","post"]
	},(stream, headers, flags, route_data) => {
		resStream(stream,200);
	});

	router.addRoute({
		path: "/api",
		methods: "get",
		options: {
			end: false
		}
	},(stream, headers, flags, route_data) => {
		resStream(stream,200);
	});

	router.addRoute({
		path: "/id/:id?",
		methods: ["get","post"],
	}, (stream, headers, flags,route_data) => {
		resStream(
			stream,
			200,
			`${route_data.params["id"]}`
		);
	});

	let nested_id_router = new Router();

	nested_id_router.addRoute({
		path: "/other_stuff",
		methods: "get"
	}, (stream, headers, flags, route_data) => {
		resStream(stream,200);
	});

	nested_id_router.addRoute({
		path: "/query/:table",
		methods: "get"
	}, (stream, headrs, flags, route_data) => {
		resStream(
			stream,
			200,
			`${route_data.params["id"]},${route_data.params["table"]}`
		);
	});

	nested_id_router.addRoute({
		path: "/query/:table",
		methods: "post"
	}, (stream, headers, flags, route_data) => resStream(stream,200));

	try {
		nested_id_router.addRoute({
			path: "/query/:table",
			methods: "get"
		}, (stream, headers, flags, route_data) => {});

		console.warn("was able to add a route that already exists");
	}
	catch(err) {}

	try {
		nested_id_router.addRoute({
			path: "/query/:table",
			methods: ["get","post"]
		}, (stream,headers,flags, route_data) => {});

		console.warn("was able to add a route that already exists");
	}
	catch(err) {}
	
	nested_id_router.addRoute({
		path: "/",
		methods: "get"
	}, (stream, headers, flags, route_data) => {
		let url = route_data.getURL();

		resStream(stream, 200, `${route_data.params["id"]},${url.pathname + url.search}`);
	});
	
	router.addMount({
		path: "/nested/:id"
	}, nested_id_router);

	console.log("creating server");
	
	const server = http2.createServer();
	let sessions = [];

	server.on("session", session => {
		let ses_index = 0;
		let set_session = false;

		for(; ses_index < sessions.length; ++ses_index) {
			if (sessions[ses_index] == null) {
				sessions[ses_index] = session;
				set_session = true;
				break;
			}
		}

		if (!set_session) {
			sessions.push(session);
		}

		session.on("close", () => {
			sessions[ses_index] = null;
		});

		session.on("stream", async (stream,headers,flags) => {
			let url = new URL(headers[":path"],`${headers[":scheme"]}://${headers[":authority"]}`);

			try {
				let result = await router.run(url,headers[":method"].toLowerCase(),[stream,headers,flags]);

				if (!result.found_path) {
					resStream(stream,404,"not found");
				}
				else {
					if (!result.valid_method) {
						resStream(stream,405,"invalid method");
					}
				}
			} catch (err) {
				console.error(err.stack);

				if (stream.headersSent) {
					stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
				}
				else {
					resStream(stream,500,"server error");
				}
			}

			console.log(`${headers[":method"]} ${stream.sentHeaders[":status"]} ${headers[":path"]}`);
		});
	});

	server.on("listening",() => {
		console.log("server listening");
	});

	server.listen(8000);
}

console.log("running test server");

main().catch(err => console.error(err.stack));