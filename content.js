function rh_content ()
{
    var _verbose = false;

    var _last_highlighted_el = null;
    var _last_highlighted_el_border = '';

    var _ad_elements = [];

    var _frame_id = '0';
    var _src_url = '';

    var _messaged_iframes = 0;
    var _pending_iframe_objs = {};
    var _parent_frame = null;
    var _num_pending_child_scans = 0;

    var _perf = window.performance;

    function log (msg)
    {
        console.log ("[rabbithole] ", msg);
    }

    function check_iframe_access (iframe)
    {
        var valid = false;
        var doc;
        try
        {
            log ("checking access to iframe with src=" + iframe.src);
            doc = iframe.contentDocument || iframe.contentWindow.document;

            doc.body.setAttribute ('data-rh-accessible', 1);
            log ("  doc.body.dataset.rhAccessible: " + doc.body.dataset.rhAccessible);
            log ("  doc.body.getAttribute(data-rh-accessible): " + doc.body.getAttribute ('data-rh-accessible'));
            valid = (doc.body.dataset.rhAccessible == 1);
        }
        catch (e)
        {
            log ("failed to access iframe contents: " + e.toString ());
        }

        if (valid)
        {
            iframe.setAttribute ('data-rh-accessible', 1);
        }
        else
        {
            iframe.setAttribute ('data-rh-accessible', 0);
        }

        return valid;
    }

    function create_el_data (el)
    {
        var tagname = "";
        var id = "";
        var cname = "";

        if (typeof el.tagName === 'string')
        {
            tagname = el.tagName.toLowerCase ();
        }
        if (typeof el.id === 'string')
        {
            id = el.id;
        }
        if (typeof el.className === 'string')
        {
            cname = el.className;
        }
        var o = {
            tagname: tagname,
            id: id,
            class: cname,
            children: [],
            performance: {
                recorded: false,
                duration: 0,
                loadStart: 0,
            }
        };

        return o;
    }

    function descend_log (o, depth)
    {
        var msg = '';
        for (var i = 0; i < depth; i++)
        {
            msg = "  " + msg;
        }

        msg += "<" + o.tagname + " id=\"" + o.id + "\"";
        if (typeof o.src !== 'undefined')
        {
            msg += " src=\"" + o.src + "\"";
            var url = o.href;
        }
        if (typeof o.href !== 'undefined')
        {
            msg += " href=\"" + o.href + "\"";
            var url = o.href;
        }
        msg += ">";

        if (_verbose)
        {
            log (msg);
        }
    }

    function descend (el, o, depth, page)
    {
        if (typeof depth === 'undefined')
        {
            depth = 0;
        }

        if (typeof page === 'undefined')
        {
            page = "neither";
        }

        var children = el.childNodes;

        if (!children)
        {
            return;
        }

        if (typeof children.length === 'undefined')
        {
            return;
        }

        for (var i = 0; i < children.length; i++)
        {
            var child_perf = _perf;

            var child = children[i];
            var url = "";
            var o2 = create_el_data (child);

            var keep_child = true;
            var iframe_accessible = true;
            switch (o2.tagname)
            {
                case 'html':
                    break;

                case 'div':
                    break;

                case 'canvas':
                    break;

                case 'form':
                    break;

                case 'iframe':
                    o2.src = url = child.src;
                    if (!o2.src)
                    {
                        o2.src = "";
                    }

                    iframe_accessible = check_iframe_access (child);
                    if (!iframe_accessible)
                    {
                        // if we can't directly descend through the iframe's DOM, we'll post a message to it
                        // to get it to scan itself and report back.

                        o2.iframe_denied = true;

                        _messaged_iframes++;
                        o2.rh_frame_id = _frame_id + "-" + _messaged_iframes;

                        log ("frame " + _frame_id + " posting message to scan frame " + o2.rh_frame_id);

                        _num_pending_child_scans++;
                        chrome.runtime.sendMessage({ action: "scan_frame"}, function(response) {});

                        child.contentWindow.postMessage ({
                            type: 'scan_frame',
                            frame_id: o2.rh_frame_id,
                            src_url: child.src
                        }, '*');

                        _pending_iframe_objs[o2.rh_frame_id] = o2;

                        break;
                    }
                    break;

                case 'script':
                    o2.src = url = child.src;
                    if (!o2.src)
                    {
                        o2.src = "";
                    }
                    break;

                case 'a':
                    o2.href = url = child.href;
                    if (!o2.href)
                    {
                        o2.href = "";
                    }
                    break;

                case 'img':
                    o2.src = child.src;
                    url = child.src;
                    if (!o2.src)
                    {
                        o2.src = "";
                    }
                    o2.width = child.width;
                    o2.height = child.height;
                    break;

                case '':
                    continue;

                default:
                    // "compress" the tree by not tracking tags we don't care about
                    // descend_o = o;
                    keep_child = false;
            }

            if (url != "")
            {
                var entry = _perf.getEntriesByName (url)[0];
                if (entry)
                {
                    log ("found performance for url: " + url + ": " + parseInt (entry.duration));
                    o2.performance.recorded = true;
                    o2.performance.duration = entry.duration;
                    o2.performance.loadStart = _perf.timing.loadEventStart + entry.fetchStart;
                }
                else
                {
                    log ("no performance information for url: " + url);
                    var foo = 1;
                }
            }

            o2.parent_window_url = document.location.href;

            if (child.style && child.style.backgroundImage)
            {
                var backgroundImageFull = child.style.backgroundImage.replace ("/\/\//i", "http://");
                o2.background_image = backgroundImageFull;
            }
            else if (window.getComputedStyle (child, null) && window.getComputedStyle (child, null).backgroundImage !== "none")
            {
                var backgroundImageFull = window.getComputedStyle (child, null).backgroundImage;
                o2.background_image = backgroundImageFull;
            }

            descend_log (o2, depth);

            var descend_el = child;
            var descend_o = o2;

            if ((o2.tagname == 'iframe'))
            {
                if (!iframe_accessible)
                {
                    o.children.push (o2);
                    continue;
                }
                else
                {
                    var innerDoc = child.contentDocument || child.contentWindow.document;
                    var o3 = create_el_data (innerDoc.documentElement);
                    o2.children.push (o3);
                    o.children.push (o2);

                    descend_el = innerDoc.documentElement;
                    descend_o = o3;
                    child_perf = child.contentWindow.performance;
                }
            }
            else
            {
                if (keep_child)
                {
                    o.children.push (o2);
                }
                else
                {
                    descend_o = o;
                }
            }

            var my_perf = _perf;
            _perf = child_perf;
            descend (descend_el, descend_o, depth + 1, page);

            _perf = my_perf;
        }
    }

    function scan_page (request, callback)
    {
        //log ("scanning page...");
        var ad_objects = [];

        setTimeout (function ()
        {
            var t = performance.timing;
            log (t);
        }, 0);

        _ad_elements = document.querySelectorAll (request.selector);

        if (typeof _ad_elements.length === 'undefined')
        {
            callback (ad_objects);
            return;
        }

        for (var i = 0; i < _ad_elements.length; i++)
        {
            var ad_el = _ad_elements[i];
            var o = create_el_data (ad_el);
            descend (ad_el, o, 0, "scan_page");
            ad_objects.push (o);
        }

        // wait for all sub-frames to get scanned
        var wait_count = 0;
        var wait = setInterval (function () {
            log ("checking to see if there are pending scans...");
            chrome.runtime.sendMessage({ action: "get_num_pending_scans"}, function(response) {
                log ("num_pending scans: " + response.num_pending_scans);
                if (response.num_pending_scans == 0)
                {
                    clearInterval (wait);
                    callback (ad_objects);
                    return;
                }

                wait_count++;
                if (wait_count > 50) { clearInterval (wait);
                    callback (ad_objects);
                }
            });
        }, 50);

        return false;
    }

    function scan_frame ()
    {
        var doc = document.documentElement;

        log ("scanning frame " + _frame_id);
        var o = create_el_data (doc);
        descend (doc, o, 0, o);
        o.frame = {
            frame_id: _frame_id,
            url: _src_url
        };

        var wait = setInterval (function () {
            if (_num_pending_child_scans > 0)
            {
                return;
            }
            clearInterval (wait);


            if (_verbose)
            {
                log ("done scanning frame " + _frame_id + ": " + JSON.stringify (o).substring (0, 100));
            }
            var d = document.documentElement;
            d.setAttribute ('data-rh-scanned', _frame_id);
            _parent_frame.postMessage ({type: 'frame_scanned', o: o}, '*');
        }, 25);

        return o;
    }

    function scroll_into_view (request)
    {
        if (typeof request.idx === 'undefined')
        {
            return;
        }

        if (typeof _ad_elements.length === 'undefined')
        {
            return;
        }

        if ((request.idx < 0) || (request.idx > _ad_elements.length - 1))
        {
            return;
        }

        var el = _ad_elements[request.idx];

        if (_last_highlighted_el !== null)
        {
            _last_highlighted_el.style.border = _last_highlighted_el_border;
        }

        _last_highlighted_el = el;
        _last_highlighted_el_border = "" + el.style.border;

        el.style.border = "5px solid lightgreen";
        el.scrollIntoView ({
            behavior: "smooth",
            block: "start"
        });
    }

    function receive_message (e)
    {
        var o;

        if (e.data.type == 'scan_frame')
        {
            _frame_id = e.data.frame_id;
            _src_url = e.data.src_url;
            _parent_frame = e.source;
            scan_frame ();
        }

        if (e.data.type == 'frame_scanned')
        {
            _num_pending_child_scans--;
            chrome.runtime.sendMessage({ action: "frame_scanned"}, function(response) {});

            var frame_id = e.data.o.frame.frame_id;
            o = e.data.o;
            log ("[frame_scanned] checking to see if frame " + frame_id + " is in our pending list");
            if (typeof _pending_iframe_objs[frame_id] !== 'undefined')
            {
                log ("[frame_scanned] merging frame_id " + frame_id);
                var parent = _pending_iframe_objs[frame_id];
                parent.children = [o];
            }
        }
    }

    function run ()
    {
        // Listen for messages
        window.addEventListener ("message", receive_message, false);

        chrome.runtime.onMessage.addListener (function (request, sender, callback)
        {
            // If the received message has the expected format...
            switch (request.text)
            {
                case 'scan_page':
                    // log ("scan_page message received...");
                    chrome.runtime.sendMessage({ action: "reset_pending_scans"}, function (response) {
                        scan_page (request, callback);
                    });
                    return true;

                case 'scroll_into_view':
                    // log ("scroll_into_view message received...");
                    scroll_into_view (request);
                    break;
            }
        });
    }

    return {
        run: run
    };
}


console.log ("[rabbithole] running content.js in iframe (" + window.location + ")");

var d = document.documentElement;
d.setAttribute ('data-rh-ran-content', 1);

var c = new rh_content ();
c.run ();

console.log ("[rabbithole] done with content.js in iframe (" + window.location + ")");

var x = 'success';
x;
