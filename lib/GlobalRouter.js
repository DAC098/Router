const EventEmitter = require('events');

function getTabs(count,character = '  ') {
	let rtn = '';
	for(let c = 0; c < count; ++c) {
		rtn += character;
	}

	return rtn;
}

class GlobalRouter extends EventEmitter {
	constructor() {
		super();
		this.id_count = 0;
	}

	getID() {
		return ++this.id_count;
	}

	static routerToStr(router,depth,count) {
		let name = `${getTabs(count)}name: ${router.name}\n`;
		let rots = `${getTabs(count)}routes:\n`;

		for(let [k,v] of router.routes) {
			if(v.type === 'mount') {
				if(depth === null || depth === undefined || depth !== count)
					rots += getTabs(count + 1) + 'key: ' + k + '\n' +
					        getTabs(count + 1) + 'middleware: ' + v.middleware.length + '\n' +
					        GlobalRouter.routerToStr(v.router,depth,count + 2);
			} else {
				let methods = '';
				v.methods.forEach((v,k) => {
					methods += '\n' + getTabs(count + 2) + k + ' middleware: ' + v.middleware.length;
				});
				rots += getTabs(count + 1) + 'key: ' + k + '\n' +
				        getTabs(count + 1) + 'methods:' + methods + '\n';
			}
		}

		return name + rots;
	}

	static routerStructure(router,depth) {
		return GlobalRouter.routerToStr(router,depth,0);
	}

	routerStructure(router,depth) {
		return GlobalRouter.routerToStr(router,depth,0);
	}
}

module.exports = GlobalRouter;