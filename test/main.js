const Router = require('../index');
const global = require('../global');

global.on('addRoute',(router,key) => {
	console.log('route added',router.name,key);
});

global.on('addMount',(router,key) => {
	console.log('mount added',router.name,key);
});

global.on('endpoint',(router,k) => {
	console.log('running endpoint',router.name,k);
});

global.on('middleware',(router,k) => {
	console.log('running middleware',router.name,k);
});

global.on('mount',(router,k) => {
	console.log('running mount',router.name,k);
});

const r1 = new Router();
const r2 = new Router();
const r3 = new Router();

r1.use(() => {
	console.log('catch all middleware');
});

r1.get('/path/to/place',() => {
	console.log('get /path/to/place reached');
});

r1.use('/path',() => {
	console.log('/path middleware');
});

r1.post('/path/to/place',() => {
	console.log('post /path/to/place reached');
});

r1.addMount({path:'/other'},r2);

r2.get('/some/place',() => {
	console.log('get /other/some/place reached');
});

console.log('router\n' + global.routerStructure(r1,null));

(async () => {
	try {
		let rtn = await r1.run({'method':'get','url':'/path/to/place'},{});
		console.log('rtn',rtn);
	} catch(err) {
		console.log(err.stack);
	}
	try {
		let rtn = await r1.run({'method':'post','url':'/path/to/place'},{});
		console.log('rtn',rtn);
	} catch(err) {
		console.log(err.stack);
	}
	try {
		let rtn = await r1.run({'method':'get','url':'/other/some/place'},{});
		console.log('rtn',rtn);
	} catch(err) {
		console.log(err.stack);
	}
})();
