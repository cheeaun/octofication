(function(w){
	var d = window.document;
	var $ = function(id){
		return d.getElementById(id);
	};
	var $view = function(view){
		var views = d.querySelectorAll('.view');
		for (var i=0, l=views.length; i<l; i++){
			views[i].style.display = 'none';
		}
		if (!view) return;
		var viewSection = $('view-' + view);
		if (viewSection) viewSection.style.display = 'block';
	};
	var $subview = function(view){
		var views = d.querySelectorAll('.sub-view');
		for (var i=0, l=views.length; i<l; i++){
			views[i].style.display = 'none';
		}
		if (!view) return;
		var viewSection = $('sub-view-' + view);
		if (viewSection) viewSection.style.display = 'block';
	};
	var $dialog = function(dialog){
		var dialogs = d.querySelectorAll('.dialog');
		for (var i=0, l=dialogs.length; i<l; i++){
			dialogs[i].classList.remove('show');
		}
		var cover = $('cover');
		cover.classList.remove('show');
		if (!dialog) return;
		dialog = $('dialog-' + dialog);
		if (dialog){
			dialog.classList.add('show');
			cover.classList.add('show');
		}
	};
	var _TPL = {};
	var $tpl = function(name, data, partials){
		if (!name || !data) return '';
		var tpl = _TPL[name];
		if (!tpl){
			var s = $('tpl-' + name);
			if (!s) return '';
			tpl = Mustache.compile(s.textContent);
			_TPL[name] = tpl;
		}
		return tpl(data, partials);
	};

	var scheduleNextPoll = function(delay){
		chrome.alarms.clearAll();
		chrome.alarms.create({
			delayInMinutes: delay || 15
		});
	};

	var updateBadge = function(count){
		if (!count) count = d.querySelectorAll('.notification:not(.read)').length;
		chrome.browserAction.setBadgeText({
			text: !count ? '' : count <= 999 ? (''+count) : '999+'
		});
	};

	var auth = new OAuth2('github', config.auth);
	var server;

	ruto
		.add('/', function(){
			if (auth.hasAccessToken()){
				ruto.go('/notifications');
			} else {
				$view('auth');
				d.body.classList.remove('loading');
			}
		})
		.add('/notifications', function(){
			$view('notifications');
			server.notifications.query().all().execute().done(function(result){
				d.body.classList.remove('loading');
				console.log(result);
				var count = result.length;
				if (!count){
					$subview('nounread');
				} else {
					$subview('unreads');

					result.sort(function(a, b){
						return a._index - b._index;
					});

					// Group up the notifications
					var groupedNotifications = {};
					for (var i=0; i<count; i++){
						var n = result[i];
						var repo = n.repository.full_name;
						if (groupedNotifications[repo]){
							groupedNotifications[repo].notifications.push(n);
						} else {
							groupedNotifications[repo] = {
								repository: n.repository,
								notifications: [n]
							};
						}
					}

					// Reformat groupedNotifications again, for templating
					var data = [];
					for (var full_name in groupedNotifications){
						var n = groupedNotifications[full_name];
						data.push({
							repository: {
								full_name: full_name,
								name: n.repository.name,
								id: n.repository.id,
								url: n.repository.html_url,
								count: n.notifications.length,
								notifications_url: n.repository.notifications_url.replace(/\{\?[^{}]+\}/i, '') // Remove weird {} stuff
							},
							notifications: n.notifications.map(function(noti){
								noti.human_updated_at = moment(noti.updated_at).fromNow();
								noti.subject.html_url = noti.subject.url.replace('//api.', '//').replace('/repos/', '/');
								return noti;
							})
						});
					}

					// Display 'em
					$('notifications-list').innerHTML = $tpl('notifications', {list: data});
				}
			});
		});

	db.open(config.db).done(function(s){
		server = s
		ruto.init();
	});

	// Sign in button
	$('sign-in-button').addEventListener('click', function(e){
		auth.authorize(function() {
			if (auth.hasAccessToken()) $view('notifications');
		});
		e.preventDefault();
	}, false);

	d.addEventListener('click', function(e){
		var el = e.target;
		if (el.classList.contains('mark-thread-read')){ // Mark thread as read
			e.preventDefault();
			var url = el.href;
			if (!url) return;
			var id = el.dataset.id;
			var xhr = new XMLHttpRequest();
			xhr.onload = function(){
				if (this.status == 205){
					server.notifications.remove(id);
				}
			};
			xhr.open('PATCH', url + '?access_token=' + auth.getAccessToken(), true);
			xhr.send(JSON.stringify({
				read: true,
				last_read_at: sessionStorage.lastChecked
			}));
			$('notification-' + id).classList.add('read');
			updateBadge();
		} else if (el.classList.contains('mark-repo-read')){ // Mark notifications in a repo as read
			e.preventDefault();
			var url = el.href;
			if (!url) return;
			var id = el.dataset.id;
			var notiEls = $('repo-' + id).parentNode.querySelectorAll('.notification');
			var xhr = new XMLHttpRequest();
			xhr.onload = function(){
				if (this.status == 205){
					for (var i=0, l=notiEls.length; i<l; i++){
						var id = (notiEls[i].id.match(/^notification\-(\d+)$/i) || [,''])[1];
						if (id) server.notifications.remove(id);
					}
				}
			};
			xhr.open('PUT', url + '?access_token=' + auth.getAccessToken(), true);
			xhr.send(JSON.stringify({
				read: true,
				last_read_at: sessionStorage.lastChecked
			}));
			el.classList.add('disabled');
			for (var i=0, l=notiEls.length; i<l; i++){
				notiEls[i].classList.add('read');
			}
			updateBadge();
		}
	}, false);

	// Mark everything as read
	$('mark-everything-read').addEventListener('click', function(e){
		e.preventDefault();
		var xhr = new XMLHttpRequest();
		xhr.onload = function(){
			if (this.status == 205){
				server.notifications.clear();
			}
		};
		xhr.open('PUT', 'https://api.github.com/notifications?access_token=' + auth.getAccessToken(), true);
		xhr.send(JSON.stringify({
			read: true,
			last_read_at: sessionStorage.lastChecked
		}));
		var notiEls = d.querySelectorAll('.notification');
		for (var i=0, l=notiEls.length; i<l; i++){
			notiEls[i].classList.add('read');
		}
		var repoReadButtons = d.querySelectorAll('.mark-repo-read');
		for (var i=0, l=repoReadButtons.length; i<l; i++){
			repoReadButtons[i].classList.add('disabled');
		}
		$dialog();
		updateBadge();
	}, false);

	// The 'fake' Mark everything as read button
	$('confirm-mark-everything-read').addEventListener('click', function(e){
		e.preventDefault();
		$dialog('markall');
	}, false);

	// Cancel Mark everything as read
	$('cancel-mark-everything-read').addEventListener('click', function(e){
		e.preventDefault();
		$dialog();
	}, false);

	// Enable CSS transitions only after page load
	w.onload = function(){
		d.body.classList.remove('no-transition');
	};

})(window);