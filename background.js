(function(){
	var auth = new OAuth2('github', authConfig);

	var scheduleNextPoll = function(delay){
		chrome.alarms.clearAll();
		chrome.alarms.create({
			delayInMinutes: delay || 15
		});
	};

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
			var count = result.length;

			chrome.browserAction.setBadgeText({
				text: !count ? '' : count <= 999 ? (''+count) : '999+'
			});

			console.log((new Date()).toLocaleTimeString() + ' - ' + count + ' notifications');
			scheduleNextPoll();
		};
		xhr.onerror = xhr.onabort = xhr.ontimeout = function(){
			scheduleNextPoll(5);
		};
		xhr.open('GET', 'https://api.github.com/notifications?access_token=' + auth.getAccessToken() + '&_=' + Math.round(+new Date()/1000/60/10), true);
		xhr.send();
	};

	chrome.runtime.onInstalled.addListener(function(){
		if (auth.getAccessToken()){
			updateBadge();
			scheduleNextPoll();
		}
	});

	chrome.alarms.onAlarm.addListener(updateBadge);

	chrome.browserAction.setBadgeBackgroundColor({
		color: '#4183C4'
	});
})();