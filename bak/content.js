/* debugging variable */
var debug = 0;
/* ****************** */

var _last_highlighted_el = null;
var _last_highlighted_el_border = '';

var _ad_elements = [];
var _performance_obj = [];
var _loaded = 0;
var _time_start = 0;

var _frame_id = '';
var _parent_frame = null;
var _num_frames = 0;
var _num_frame_ids_set = 0;
var _set_frame_ids_callback = null;

function check_iframe_access (iframe)
{
  try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      var origClass = doc.body.className;
      var newClass = origClass += " xxxxx";
      doc.body.className = newClass;
      var valid = doc.body.className == newClass;
      doc.body.className = origClass;
      return(valid);
  }
  catch(e) {
      return(false);
  }
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
      duration: 0,
      startTime: 0
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

    // console.log (msg);
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
        var child = children[i];
        var url = "";
        var o2 = create_el_data (child);

        var descend_el = child;
        var keep_child = true;
        switch (o2.tagname)
        {
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

                if (!check_iframe_access (child))
                {
                    o2.iframe_denied = true;
                    descend_el = null;
                    break;
                }
                var innerDoc = child.contentDocument || child.contentWindow.document;
                descend_el = innerDoc.documentElement;
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

        if ( url != "" ) {
            var entry = performance.getEntriesByName(url)[0];
            if ( entry ) {
                // o2.duration = entry.duration;
                // o2.startTime = typeof entry.fetchStart !== "undefined"? entry.fetchStart : 0;
                // o2.loadStart = typeof performance.timing.loadEventStart !== "undefined"? performance.timing.loadEventStart : 0;

                o2.duration = entry.duration;
                o2.loadStart = performance.timing.loadEventStart + entry.fetchStart;
            }
        }

        o2.parent_window_url = document.location.href;

        if (child.style && child.style.backgroundImage)
        {
            var backgroundImageFull = child.style.backgroundImage.replace("/\/\//i","http://");
            o2.background_image = backgroundImageFull;
        }
        else if(window.getComputedStyle(child,null) && window.getComputedStyle(child,null).backgroundImage !== "none")
        {
            var backgroundImageFull = window.getComputedStyle(child,null).backgroundImage;
            o2.background_image = backgroundImageFull;
        }

        //descend_log (o2, depth);

        if (keep_child)
        {
            o.children.push (o2);
        }

        if (descend_el !== null)
        {
            descend (descend_el, (keep_child ? o2 : o), depth + 1, page);
        }
    }
}

function scan_page (request, callback)
{
  //console.log("scanning page...");
  var ad_objects = [];

  setTimeout(function(){
    var t = performance.timing;
    console.log(t);
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

  callback (ad_objects);
  return false;
}

function scan_frame (request, callback)
{
  //console.log("scanning frame..." + request.frameId);
  var doc = document.documentElement;
  var o = create_el_data (doc);
  descend (doc, o, 0, o);
  o.frame = {
      rhFrameId: _frame_id,
      frameId: request.frameId,
      parentFrameId: request.parentFrameId,
      url: request.url
  };
  callback (o);
  return false;
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
    // console.log ("restoring border style of last highlighted el to '" + _last_highlighted_el_border + "'...");
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


// this will trigger a call to the onBeforeLoad function in background.js
/*  DONT NEED
var script = document.createElement('script');
script.src = chrome.runtime.getURL('getFrameId') + '?' + Math.random();
document.documentElement.appendChild(script);
*/

// Listen for messages
chrome.runtime.onMessage.addListener(function (request, sender, callback) {
    // If the received message has the expected format...
    switch (request.text)
    {
        case 'set_frame_ids':
            //console.log ("set_frame_ids message received by frame " + request.frameId + "...");
            window.removeEventListener("message", receive_message, false);
            window.addEventListener("message", receive_message, false);

            _set_frame_ids_callback = callback;
            set_frame_ids ();
            break;

        case 'receive_frame_id':
            //console.log ("receive_frame_id message received by frame " + request.frameId + "...");

            var d = document.documentElement;
            d.setAttribute('data-rabbithole-added-listener', 1);

            window.removeEventListener("message", receive_message, false);
            window.addEventListener("message", receive_message, false);

            break;

        case 'scan_page':
          // console.log ("scan_page message received...");
            scan_page (request, callback);
            break;

        case 'scan_frame':
          // console.log ("scan_frame message received by frame " + request.frameId + "...");
            scan_frame (request, callback);
            break;

        case 'scroll_into_view':
          // console.log ("scroll_into_view message received...");
            scroll_into_view (request);
            break;
    }
});


function receive_message (e)
{
    if (e.data.type == 'set_frame_id')
    {
        //console.log ("received 'set_frame_id'; frame id = " + e.data.id);
        _parent_frame = e.source;
        _frame_id = e.data.id;

        var d = document.documentElement;
        d.setAttribute('data-rabbithole-frameid', _frame_id);
        set_frame_ids (_frame_id);

        // if we have no child iframes, then we can tell our parent we're good to go
        check_descendent_ids ();
        return;
    }

    // if we have child iframes, we will get messages from each indicating that everything
    // beneath them has been set
    if (e.data.type == 'frame_ids_set')
    {
        _num_frame_ids_set++;
        //console.log ("received 'frame_ids_set' (from frame " + e.data.id + " to frame " + _frame_id + "); " + _num_frame_ids_set + "/" + _num_frames + " frame ids set");
        check_descendent_ids ();
        return;
    }
}

function check_descendent_ids ()
{
    if (_num_frame_ids_set == _num_frames)
    {
        //console.log ("frame " + _frame_id + " -- all descendents' frame ids set; reporting upstream");
        if (_parent_frame !== null)
        {
            _parent_frame.postMessage ({ type: 'frame_ids_set', id: _frame_id }, '*');
        }
        else
        {
            _set_frame_ids_callback ();
        }
    }
}

function set_frame_ids (prefix)
{
    var iframes = document.querySelectorAll ('iframe');
    var id = 0;

    if (typeof prefix === 'undefined')
    {
        prefix = '';
    }

    //console.log ("setting frame_ids with prefix '" + prefix + "' for " + iframes.length + " iframes...");

    if (prefix !== '')
    {
        prefix = '' + prefix + '-';
    }

    _num_frames = iframes.length;
    _num_frame_ids_set = 0;

    for (var i = 0; i < iframes.length; i++)
    {
        var iframe = iframes[i];
        iframe.setAttribute ('data-rabbithole-frameid', prefix + id);

        //console.log ("  iframe " + prefix + id + ": " + iframe.id + " (" + iframe.src + ")");

        iframe.contentWindow.postMessage ({ type: 'set_frame_id', id: prefix + id }, '*');
        id++;
    }
}

//console.log ("running content.js");
//document.body.style.backgroundColor="red";
var d = document.documentElement;
d.setAttribute('data-rabbithole-ran-content', 1);
