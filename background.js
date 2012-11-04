(function(){
	var auth = new OAuth2('github', config.auth);

	var scheduleNextPoll = function(delay){
		chrome.alarms.clearAll();
		chrome.alarms.create({
			delayInMinutes: delay || 15
		});
	};

	var server;

	var updateBadge = function(){
		if (!auth.hasAccessToken()) return;
		var xhr = new XMLHttpRequest();
		xhr.onload = function(){
			var response = this.responseText;
			var result;
			try {
				result = JSON.parse(response);
			} catch (e) {}
			if (!result){
				scheduleNextPoll(5);
				return;
			}
			console.log(result);
			var count = result.length;

			chrome.browserAction.setBadgeText({
				text: !count ? '' : count <= 999 ? (''+count) : '999+'
			});

			console.log((new Date()).toLocaleTimeString() + ' - ' + count + ' notifications');
			scheduleNextPoll();

			// Clear all first, then store notifications in DB
			server.notifications.clear();
			for (var i=0; i<count; i++){
				var r = result[i];
				r._index = i;
				// Index is needed to maintain the sort order
				// else the order will be gone when saved into DB
				server.notifications.add(r);
			}

			// Store the last checked datetime
			sessionStorage.lastChecked = (new Date()).toISOString();
		};
		xhr.onerror = xhr.onabort = xhr.ontimeout = function(){
			scheduleNextPoll(5);
		};
		xhr.open('GET', 'https://api.github.com/notifications?access_token=' + auth.getAccessToken() + '&_=' + Math.round(+new Date()/1000), true);
		xhr.send();
	};

	chrome.browserAction.setBadgeBackgroundColor({
		color: '#4183C4'
	});

	db.open(config.db).done(function(s){
		server = s;
		var tokenCheck = function(){
			if (auth.getAccessToken()){
				chrome.browserAction.setBadgeText({
					text: ''
				});
				updateBadge();
				scheduleNextPoll();
			} else {
				chrome.browserAction.setBadgeText({
					text: '?'
				});
				setTimeout(tokenCheck, 1000);
			}
		};
		tokenCheck();
		chrome.alarms.onAlarm.addListener(updateBadge);
	});

})();