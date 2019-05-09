/*
 * TODO:
 * - remember settings in the hash or offer link
 * - life 1.05 is currently broken
 * - better mobile handling: allow drawing
 * - jump to coordinate
 * - make screenshots, maybe gifs
 * - allow people to upload patterns
 * - maybe more than 2 states (non-life)
 * - fail-safe http requests and pattern parsing
 * - restore meta life
 * - error when zooming while pattern is loading
 * - run http://copy.sh/life/?pattern=demonoid_synth without crashing (improve memory efficiency)
 * - some patterns break randomly (hard to reproduce, probably related to speed changing)
 */

"use strict";


var
    /** @const */
    DEFAULT_BORDER = 0.25,
    /** @const */
    DEFAULT_FPS = 20;


(function()
{
    //var console = console || { log : function() {} };
    var initial_title = document.title;
    var initial_description = "";

    if(!document.addEventListener)
    {
        // IE 8 seems to switch into rage mode if the code is only loaded partly,
        // so we are saying goodbye earlier
        return;
    }

    var

        /**
         * which pattern file is currently loaded
         * @type {{title: String, urls, comment, view_url, source_url}}
         * */
        current_pattern,

        // functions which is called when the pattern stops running
        /** @type {function()|undefined} */
        onstop,

        last_mouse_x,
        last_mouse_y,

        mouse_set,

        // is the game running ?
        /** @type {boolean} */
        running = false,

        /** @type {number} */
        max_fps,

        // has the pattern list been loaded
        /** @type {boolean} */
        patterns_loaded = false,

        /**
         * path to the folder with all patterns
         * @const
         */
        pattern_path = "examples/",

        loaded = false,


        life = new LifeUniverse(),
        drawer = new LifeCanvasDrawer(),

        // example setups which are run at startup
        // loaded from examples/
        /** @type {Array.<string>} */
        examples = (
            "turingmachine,Turing Machine|gunstar,Gunstar|hacksaw,Hacksaw|tetheredrake,Tethered rake|" +
            "primer,Primer|infinitegliderhotel,Infinite glider hotel|" +
            "p94s,P94S|breeder1,Breeder 1|tlogtgrowth,tlog(t) growth|" +
            "logt2growth,Log(t)^2 growth|infinitelwsshotel,Infinite LWSS hotel|c5greyship,c/5 greyship"
        ).split("|");



    /** @type {function(function())} */
    var nextFrame =
        window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        setTimeout;

    // setup
    window.onload = function()
    {
        if(loaded)
        {
            // onload has been called already
            return;
        }

        loaded = true;

        initial_description = document.querySelector("meta[name=description]").content;

        if(!drawer.init(document.body))
        {
            set_text($("notice").getElementsByTagName("h4")[0],
                "Canvas-less browsers are not supported. I'm sorry for that.");
            return;
        }

        init_ui();

        drawer.set_size(window.innerWidth, document.body.offsetHeight);
        reset_settings();

        // This gets called, when a pattern is loaded.
        // It has to be called at least once before anything can happen.
        // Since we always load a pattern, it's not necessary at this point.
        //life.clear_pattern();

        // production setup
        // loads a pattern defined by ?pattern=filename (without extension)
        // or a random small pattern instead
        var query = location.search.substr(1).split("&"),
            param,
            parameters = {};

        for(var i = 0; i < query.length; i++)
        {
            param = query[i].split("=");

            parameters[param[0]] = param[1];
        }

        if(parameters["step"] && /^\d+$/.test(parameters["step"]))
        {
            var step_parameter = Math.round(Math.log(Number(parameters["step"])) / Math.LN2);

            life.set_step(step_parameter);
        }

        let pattern_parameter = parameters["pattern"];
        let pattern_parameter_looks_good = pattern_parameter && /^[a-z0-9_\.\-]+$/i.test(pattern_parameter);

        let gist = parameters["gist"];
        if(gist && /^[a-fA-F0-9]+$/.test(gist))
        {
            show_overlay("loading_popup");
            let callback_name = "finish_load_gist" + (2147483647 * Math.random() | 0);
            let jsonp_url = "https://api.github.com/gists/" + gist + "?callback=" + callback_name;

            window[callback_name] = function(result)
            {
                let files = result["data"]["files"];

                if(files)
                {
                    for(let filename of Object.keys(files))
                    {
                        let file = files[filename];
                        let direct_url = file["raw_url"];
                        let view_url = "https://copy.sh/life/?gist=" + gist;
                        setup_pattern(file["content"], undefined, direct_url, view_url, filename);
                    }
                }
                else
                {
                    if(pattern_parameter_looks_good)
                    {
                        try_load_pattern(pattern_parameter);
                    }
                    else
                    {
                        load_random();
                    }
                }
            };
            let script = document.createElement("script");
            script.src = jsonp_url;
            document.getElementsByTagName("head")[0].appendChild(script);
        }
        else if(pattern_parameter_looks_good)
        {
            if(parameters["meta"] === "1")
            {
                try_load_meta();
            }
            else
            {
                // a pattern name has been given as a parameter
                // try to load it, fallback to random pattern

                try_load_pattern(pattern_parameter);
            }
        }
        else
        {
            load_random();
        }

        if(parameters["noui"] === "1")
        {
            var elements = [
                "statusbar", "about_button", "examples_menu",
                "import_button", "settings_button", "zoomout_button",
                "zoomin_button", "clear_button", "superstep_button",
                "step_button", "rewind_button"
            ];

            for(var i = 0; i < elements.length; i++)
            {
                $(elements[i]).style.display = "none";
            }
        }

        if(parameters["fps"] && /^\d+$/.test(parameters["fps"]))
        {
            max_fps = +parameters["fps"];
        }

        function try_load_meta()
        {
            // loading metapixels is broken now, keep this for later
            load_random();

            /*
            var otca_on, otca_off, otca_pattern;

            show_overlay("loading_popup");
            http_get_multiple([
                {
                    url : pattern_path + "otcametapixel.rle",
                    onready : function(result)
                    {
                        var field = formats.parse_rle(result).field;

                        life.move_field(field, -5, -5);
                        life.setup_field(field);

                        otca_on = life.root.se.nw;
                    }
                },
                {
                    url : pattern_path + "otcametapixeloff.rle",
                    onready : function(result)
                    {
                        var field = formats.parse_rle(result).field;

                        life.move_field(field, -5, -5);
                        life.setup_field(field);

                        otca_off = life.root.se.nw;
                    }
                },
                {
                    url : pattern_path + pattern_parameter + ".rle",
                    onready : function(result)
                    {
                        otca_pattern = formats.parse_rle(result).field;
                    }
                }
            ],
            function()
            {
                load_otca(otca_on, otca_off, otca_pattern);
            },
            function()
            {
                // fallback to random pattern
                load_random();
            });
            */
        }

        function try_load_pattern(id)
        {
            show_overlay("loading_popup");
            http_get(
                rle_link(id),
                function(text)
                {
                    //console.profile("main setup");
                    setup_pattern(text, pattern_parameter);
                    //console.profileEnd("main setup");
                },
                function()
                {
                    load_random();
                }
            );
        }

        function load_random()
        {
            var random_pattern = examples[Math.random() * examples.length | 0].split(",")[0];

            show_overlay("loading_popup");
            http_get(
                rle_link(random_pattern),
                function(text) {
                    setup_pattern(text, random_pattern);
                }
            );
        }


        function init_ui()
        {
            $("about_close").style.display = "inline";

            hide_element($("notice"));
            hide_overlay();

            show_element($("toolbar"));
            show_element($("statusbar"));
            show_element($("about_main"));

            var style_element = document.createElement("style");
            document.head.appendChild(style_element);

            window.onresize = debounce(function()
            {
                drawer.set_size(window.innerWidth, document.body.offsetHeight);

                requestAnimationFrame(lazy_redraw.bind(0, life.root));
            }, 500);

            $("gen_step").onchange = function(e)
            {
                if(this.type === "number")
                {
                    var value = Number(this.value);

                    if(!value)
                    {
                        return;
                    }

                    var closest_pow2 = Math.pow(2, Math.round(Math.log(value) / Math.LN2));
                    if(value <= 1)
                    {
                        this.value = 1;
                    }
                    else
                    {
                        this.value = closest_pow2;
                    }

                    this.step = this.value / 2;
                }
            };

            $("run_button").onclick = function()
            {
                if(running)
                {
                    stop();
                }
                else
                {
                    run();
                }
            };

            $("step_button").onclick = function()
            {
                if(!running)
                {
                    step(true);
                }
            };

            $("superstep_button").onclick = function()
            {
                if(!running)
                {
                    step(false);
                }
            };

            $("clear_button").onclick = function()
            {
                stop(function()
                {
                    set_title();
                    set_text($("pattern_name"), "");
                    set_query("");

                    life.clear_pattern();
                    update_hud();

                    drawer.center_view();
                    drawer.redraw(life.root);
                });
            };

            $("rewind_button").onclick = function()
            {
                if(life.rewind_state)
                {
                    stop(function()
                    {
                        life.restore_rewind_state();

                        fit_pattern();
                        drawer.redraw(life.root);

                        update_hud();
                    });
                }
            };

            //drawer.canvas.ondblclick = function(e)
            //{
            //    drawer.zoom_at(false, e.clientX, e.clientY);
            //    update_hud();
            //    lazy_redraw(life.root);
            //    return false;
            //};


            drawer.canvas.onmousedown = function(e)
            {
                if(e.which === 3 || e.which === 2)
                {
                    if(drawer.cell_width >= 1) // only at reasonable zoom levels
                    {
                        var coords = drawer.pixel2cell(e.clientX, e.clientY);

                        mouse_set = !life.get_bit(coords.x, coords.y);

                        window.addEventListener("mousemove", do_field_draw, true);
                        do_field_draw(e);
                    }
                }
                else if(e.which === 1)
                {
                    last_mouse_x = e.clientX;
                    last_mouse_y = e.clientY;
                    //console.log("start", e.clientX, e.clientY);

                    window.addEventListener("mousemove", do_field_move, true);

                    (function redraw()
                    {
                        if(last_mouse_x !== null)
                        {
                            requestAnimationFrame(redraw);
                        }

                        lazy_redraw(life.root);
                    })();
                }

                return false;
            };

            var scaling = false;
            var last_distance = 0;

            function distance(touches)
            {
                console.assert(touches.length >= 2);

                return Math.sqrt(
                    (touches[0].clientX-touches[1].clientX) * (touches[0].clientX-touches[1].clientX) +
                    (touches[0].clientY-touches[1].clientY) * (touches[0].clientY-touches[1].clientY));
            }

            drawer.canvas.addEventListener("touchstart", function(e)
            {
                if(e.touches.length === 2)
                {
                    scaling = true;
                    last_distance = distance(e.touches);
                    e.preventDefault();
                }
                else if(e.touches.length === 1)
                {
                    // left mouse simulation
                    var ev = {
                        which: 1,
                        clientX: e.changedTouches[0].clientX,
                        clientY: e.changedTouches[0].clientY,
                    };

                    drawer.canvas.onmousedown(ev);

                    e.preventDefault();
                }
            }, false);

            drawer.canvas.addEventListener("touchmove", function(e)
            {
                if(scaling)
                {
                    let new_distance = distance(e.touches);
                    let changed = false;
                    const MIN_DISTANCE = 50;

                    while(last_distance - new_distance > MIN_DISTANCE)
                    {
                        last_distance -= MIN_DISTANCE;
                        drawer.zoom_centered(true);
                        changed = true;
                    }

                    while(last_distance - new_distance < -MIN_DISTANCE)
                    {
                        last_distance += MIN_DISTANCE;
                        drawer.zoom_centered(false);
                        changed = true;
                    }

                    if(changed)
                    {
                        update_hud();
                        lazy_redraw(life.root);
                    }
                }
                else
                {
                    var ev = {
                        clientX: e.changedTouches[0].clientX,
                        clientY: e.changedTouches[0].clientY,
                    };

                    do_field_move(ev);

                    e.preventDefault();
                }
            }, false);

            drawer.canvas.addEventListener("touchend", function(e)
            {
                window.onmouseup(e);
                e.preventDefault();
                scaling = false;
            }, false);

            drawer.canvas.addEventListener("touchcancel", function(e)
            {
                window.onmouseup(e);
                e.preventDefault();
                scaling = false;
            }, false);

            window.onmouseup = function(e)
            {
                last_mouse_x = null;
                last_mouse_y = null;

                window.removeEventListener("mousemove", do_field_draw, true);
                window.removeEventListener("mousemove", do_field_move, true);
            };

            window.onmousemove = function(e)
            {
                var coords = drawer.pixel2cell(e.clientX, e.clientY);

                set_text($("label_mou"), coords.x + ", " + coords.y);
                fix_width($("label_mou"));
            };

            drawer.canvas.oncontextmenu = function(e)
            {
                return false;
            };

            drawer.canvas.onmousewheel = function(e)
            {
                e.preventDefault();
                drawer.zoom_at((e.wheelDelta || -e.detail) < 0, e.clientX, e.clientY);

                update_hud();
                lazy_redraw(life.root);
                return false;
            };

            drawer.canvas.addEventListener("DOMMouseScroll", drawer.canvas.onmousewheel, false);

            window.onkeydown = function(e)
            {
                var chr = e.which,
                    do_redraw = false,
                    target = e.target.nodeName;

                //console.log(e.target)
                //console.log(chr + " " + e.charCode + " " + e.keyCode);

                if(target === "INPUT" || target === "TEXTAREA")
                {
                    return true;
                }

                if(e.ctrlKey || e.shiftKey || e.altKey)
                {
                    return true;
                }

                if(chr === 37 || chr === 72)
                {
                    drawer.move(15, 0);
                    do_redraw = true;
                }
                else if(chr === 38 || chr === 75)
                {
                    drawer.move(0, 15);
                    do_redraw = true;
                }
                else if(chr === 39 || chr === 76)
                {
                    drawer.move(-15, 0);
                    do_redraw = true;
                }
                else if(chr === 40 || chr === 74)
                {
                    drawer.move(0, -15);
                    do_redraw = true;
                }
                else if(chr === 27)
                {
                    // escape
                    hide_overlay();
                    return false;
                }
                else if(chr === 13)
                {
                    // enter
                    $("run_button").onclick();
                    return false;
                }
                else if(chr === 32)
                {
                    // space
                    $("step_button").onclick();
                    return false;
                }
                else if(chr === 9)
                {
                    $("superstep_button").onclick();
                    return false;
                }
                else if(chr === 189 || chr === 173 || chr === 109)
                {
                    // -
                    drawer.zoom_centered(true);
                    do_redraw = true;
                }
                else if(chr === 187 || chr === 61)
                {
                    // + and =
                    drawer.zoom_centered(false);
                    do_redraw = true;
                }
                else if(chr === 8)
                {
                    // backspace
                    $("rewind_button").onclick();
                    return false;
                }
                else if(chr === 219 || chr === 221)
                {
                    // [ ]
                    var step = life.step;

                    if(chr === 219)
                        step--;
                    else
                        step++;

                    if(step >= 0)
                    {
                        life.set_step(step);
                        set_text($("label_step"), Math.pow(2, step));
                    }

                    return false;
                }

                if(do_redraw)
                {
                    lazy_redraw(life.root);

                    return false;
                }

                return true;
            };

            $("faster_button").onclick = function()
            {
                var step = life.step + 1;

                life.set_step(step);
                set_text($("label_step"), Math.pow(2, step));
            };

            $("slower_button").onclick = function()
            {
                if(life.step > 0)
                {
                    var step = life.step - 1;

                    life.set_step(step);
                    set_text($("label_step"), Math.pow(2, step));
                }
            };

            $("normalspeed_button").onclick = function()
            {
                life.set_step(0);
                set_text($("label_step"), 1);
            };

            $("zoomin_button").onclick = function()
            {
                drawer.zoom_centered(false);
                update_hud();
                lazy_redraw(life.root);
            };

            $("zoomout_button").onclick = function()
            {
                drawer.zoom_centered(true);
                update_hud();
                lazy_redraw(life.root);
            };

            $("initial_pos_button").onclick = function()
            {
                fit_pattern();
                lazy_redraw(life.root);
                update_hud();
            };

            $("middle_button").onclick = function()
            {
                drawer.center_view();
                lazy_redraw(life.root);
            };

            var positions = [
                ["ne",  1, -1],
                ["nw", -1, -1],
                ["se",  1,  1],
                ["sw", -1,  1],
                ["n",   0, -1],
                ["e",  -1,  0],
                ["s",   0,  1],
                ["w",   1,  0],
            ];

            for(var i = 0; i < positions.length; i++)
            {
                var node = document.getElementById(positions[i][0] + "_button");

                node.onclick = (function(info)
                {
                    return function()
                    {
                        drawer.move(info[1] * -30, info[2] * -30);
                        lazy_redraw(life.root);
                    };
                })(positions[i]);

            }

            var select_rules = $("select_rules").getElementsByTagName("span");

            for(var i = 0; i < select_rules.length; i++)
            {
                /** @this {Element} */
                select_rules[i].onclick = function()
                {
                    $("rule").value = this.getAttribute("data-rule");
                };
            }

            $("import_submit").onclick = function()
            {
                var previous = current_pattern && current_pattern.title;
                var files = $("import_file").files;

                function load(text)
                {
                    setup_pattern(text, undefined);

                    if(previous !== current_pattern.title) {
                        show_alert(current_pattern);
                        $("import_file").value = "";
                    }
                }

                if(files && files.length)
                {
                    let filereader = new FileReader();
                    filereader.onload = function()
                    {
                        load(filereader.result);
                    };
                    filereader.readAsText(files[0]);
                }
                else
                {
                    load($("import_text").value);
                }
            };

            $("import_abort").onclick = function()
            {
                hide_overlay();
            };

            $("import_button").onclick = function()
            {
                show_overlay("import_dialog");
                $("import_text").value = "";

                set_text($("import_info"), "");
            };

            $("export_button").onclick = function()
            {
                const rle = formats.generate_rle(life, undefined, ["Generated by copy.sh/life"]);
                download(rle, "pattern.rle");
            };

            $("randomize_button").onclick = function()
            {
                $("randomize_density").value = 0.5;
                $("randomize_width").value = 200;
                $("randomize_height").value = 200;

                show_overlay("randomize_dialog");
            };

            $("randomize_submit").onclick = function()
            {
                const density = Math.max(0, Math.min(1, +$("randomize_density").value)) || 0.5;
                const width = Math.max(0, +$("randomize_width").value) || 200;
                const height = Math.max(0, +$("randomize_height").value) || 200;

                stop(function()
                    {
                        life.clear_pattern();

                        // Note: Not exact density because some points may be repeated
                        const field_x = new Int32Array(Math.round(width * height * density));
                        const field_y = new Int32Array(field_x.length);

                        for(let i = 0; i < field_x.length; i++) {
                            field_x[i] = Math.random() * width;
                            field_y[i] = Math.random() * height;
                        }

                        var bounds = life.get_bounds(field_x, field_y);
                        life.make_center(field_x, field_y, bounds);
                        life.setup_field(field_x, field_y, bounds);

                        life.save_rewind_state();

                        hide_overlay();

                        fit_pattern();
                        lazy_redraw(life.root);

                        update_hud();

                        set_text($("pattern_name"), "Random pattern");
                        set_title("Random pattern");

                        current_pattern = {
                            title : "Random pattern",
                            comment : "",
                        };
                    });
            };

            $("settings_submit").onclick = function()
            {
                var new_rule_s,
                    new_rule_b,
                    new_gen_step;

                hide_overlay();

                new_rule_s = formats.parse_rule($("rule").value, true);
                new_rule_b = formats.parse_rule($("rule").value, false);

                new_gen_step = Math.round(Math.log(Number($("gen_step").value) || 0) / Math.LN2);

                life.set_rules(new_rule_s, new_rule_b);

                if(!new_gen_step || new_gen_step < 0) {
                    life.set_step(0);
                    set_text($("label_step"), "1");
                }
                else {
                    life.set_step(new_gen_step);
                    set_text($("label_step"), Math.pow(2, new_gen_step));
                }

                max_fps = Number($("max_fps").value);
                if(!max_fps || max_fps < 0) {
                    max_fps = DEFAULT_FPS;
                }

                drawer.border_width = parseFloat($("border_width").value);
                if(isNaN(drawer.border_width) || drawer.border_width < 0 || drawer.border_width > .5)
                {
                    drawer.border_width = DEFAULT_BORDER;
                }

                //drawer.cell_color = validate_color($("cell_color").value) || "#ccc";
                //drawer.background_color = validate_color($("background_color").value) || "#000";
                var style_text = document.createTextNode(
                    ".button,.menu>div{background-color:" + drawer.cell_color +
                    ";box-shadow:2px 2px 4px " + drawer.cell_color + "}" +
                    "#statusbar>div{border-color:" + drawer.cell_color + "}"
                );

                style_element.appendChild(style_text);

                $("pattern_name").style.color =
                $("statusbar").style.color = drawer.cell_color;
                $("statusbar").style.textShadow = "0px 0px 1px " + drawer.cell_color;

                $("toolbar").style.color = drawer.background_color;

                lazy_redraw(life.root);
            };

            $("settings_reset").onclick = function()
            {
                reset_settings();

                lazy_redraw(life.root);

                hide_overlay();
            };

            $("settings_button").onclick = function()
            {
                show_overlay("settings_dialog");

                $("rule").value = formats.rule2str(life.rule_s, life.rule_b);
                $("max_fps").value = max_fps;
                $("gen_step").value = Math.pow(2, life.step);

                $("border_width").value = drawer.border_width;
                //$("cell_color").value = drawer.cell_color;
                //$("background_color").value = drawer.background_color;
            };

            $("settings_abort").onclick =
                $("pattern_close").onclick =
                $("alert_close").onclick =
                $("randomize_abort").onclick =
                $("about_close").onclick = function()
            {
                hide_overlay();
            };

            $("pattern_name").onclick = function()
            {
                show_alert(current_pattern);
            };

            $("about_button").onclick = function()
            {
                show_overlay("about");
            };

            //$("more_button").onclick = show_pattern_chooser;
            $("pattern_button").onclick = show_pattern_chooser;

            function show_pattern_chooser()
            {
                if(patterns_loaded)
                {
                    show_overlay("pattern_chooser");
                    return;
                }

                patterns_loaded = true;

                if(false)
                {
                    var frame = document.createElement("iframe");
                    frame.src = "examples/";
                    frame.id = "example_frame";
                    $("pattern_list").appendChild(frame);

                    show_overlay("pattern_chooser");

                    window["load_pattern"] = function(id)
                    {
                        show_overlay("loading_popup");
                        http_get(rle_link(id), function(text)
                        {
                            setup_pattern(text, id);
                            set_query(id);
                            show_alert(current_pattern);
                            life.set_step(0);
                            set_text($("label_step"), "1");
                        });
                    };
                }
                else
                {
                    patterns_loaded = true;

                    show_overlay("loading_popup");
                    http_get(pattern_path + "list", function(text)
                    {
                        var patterns = text.split("\n"),
                            list = $("pattern_list");

                        show_overlay("pattern_chooser");

                        patterns.forEach(function(pattern)
                        {
                            var
                                name = pattern.split(" ")[0],
                                size = pattern.split(" ")[1],
                                name_element = document.createElement("div"),
                                size_element = document.createElement("span");

                            set_text(name_element, name);
                            set_text(size_element, size);
                            size_element.className = "size";

                            name_element.appendChild(size_element);
                            list.appendChild(name_element);

                            name_element.onclick = function()
                            {
                                show_overlay("loading_popup");
                                http_get(rle_link(name), function(text)
                                {
                                    setup_pattern(text, name);
                                    set_query(name);
                                    show_alert(current_pattern);

                                    life.set_step(0);
                                    set_text($("label_step"), "1");
                                });
                            };
                        });
                    });
                }
            }

            if(false)
            {
                var examples_menu = $("examples_menu");

                examples.forEach(function(example)
                {
                    var file = example.split(",")[0],
                        name = example.split(",")[1],

                        menu = document.createElement("div");

                    set_text(menu, name);

                    menu.onclick = function()
                    {
                        show_overlay("loading_popup");
                        http_get(rle_link(file), function(text)
                        {
                            setup_pattern(text, file);
                            set_query(file);
                            show_alert(current_pattern);
                        });
                    };

                    examples_menu.appendChild(menu);
                });
            }
        }
    };

    document.addEventListener("DOMContentLoaded", window.onload, false);


    /** @param {*=} absolute */
    function rle_link(id, absolute)
    {
        if(!id.endsWith(".mc"))
        {
            id = id + ".rle";
        }

        if(!absolute || location.hostname === "localhost")
        {
            return pattern_path + id;
        }
        else
        {
            let protocol = location.protocol === "http:" ? "http:" : "https:";
            return protocol + "//copy.sh/life/" + pattern_path + id;
        }
    }

    function view_link(id)
    {
        let protocol = location.protocol === "http:" ? "http:" : "https:";
        return protocol + "//copy.sh/life/?pattern=" + id;
    }

    /**
     * @param {function()=} callback
     */
    function stop(callback)
    {
        if(running)
        {
            running = false;
            set_text($("run_button"), "Run");

            onstop = callback;
        }
        else
        {
            if(callback) {
                callback();
            }
        }
    }

    function reset_settings()
    {
        drawer.background_color = "#000000";
        drawer.cell_color = "#cccccc";

        drawer.border_width = DEFAULT_BORDER;
        drawer.cell_width = 2;

        life.rule_b = 1 << 3;
        life.rule_s = 1 << 2 | 1 << 3;
        life.set_step(0);
        set_text($("label_step"), "1");

        max_fps = DEFAULT_FPS;

        set_text($("label_zoom"), "1:2");
        fix_width($("label_mou"));

        drawer.center_view();
    }


    /**
     * @param {string=} pattern_source_url
     * @param {string=} view_url
     * @param {string=} title
     */
    function setup_pattern(pattern_text, pattern_id, pattern_source_url, view_url, title)
    {
        const is_mc = pattern_text.startsWith("[M2]");

        if(!is_mc)
        {
            var result = formats.parse_pattern(pattern_text.trim());

            if(result.error)
            {
                set_text($("import_info"), result.error);
                return;
            }
        }
        else
        {
            result = {
                comment: "",
                urls: [],
                short_comment: "",
            };
        }

        stop(function()
        {
            if(title && !result.title)
            {
                result.title = title;
            }

            if(pattern_id && !result.title)
            {
                result.title = pattern_id;
            }

            life.clear_pattern();

            if(!is_mc)
            {
                var bounds = life.get_bounds(result.field_x, result.field_y);
                life.make_center(result.field_x, result.field_y, bounds);
                life.setup_field(result.field_x, result.field_y, bounds);
            }
            else
            {
                result = load_macrocell(life, pattern_text);
                const step = 15;
                life.set_step(step);
                set_text($("label_step"), Math.pow(2, step));
            }

            life.save_rewind_state();

            if(result.rule_s && result.rule_b)
            {
                life.set_rules(result.rule_s, result.rule_b);
            }
            else
            {
                life.set_rules(1 << 2 | 1 << 3, 1 << 3);
            }

            hide_overlay();

            fit_pattern();
            drawer.redraw(life.root);

            update_hud();
            set_text($("pattern_name"), result.title || "no name");
            set_title(result.title);

            document.querySelector("meta[name=description]").content =
                result.comment.replace(/\n/g, " - ") + " - " + initial_description;

            if(!pattern_source_url && pattern_id)
            {
                pattern_source_url = rle_link(pattern_id, true);
            }

            if(!view_url && pattern_id)
            {
                view_url = view_link(pattern_id);
            }

            current_pattern = {
                title : result.title,
                comment : result.comment,
                urls : result.urls,
                view_url : view_url,
                source_url: pattern_source_url,
            };
        });
    }

    function fit_pattern()
    {
        var bounds = life.get_root_bounds();

        drawer.fit_bounds(bounds);
    }

    /*
     * load a pattern consisting of otca metapixels
     */
    /*function load_otca(otca_on, otca_off, field)
    {
        var bounds = life.get_bounds(field);

        life.set_step(10);
        max_fps = 6;

        drawer.cell_width = 1 / 32;

        life.make_center(field, bounds);
        life.setup_meta(otca_on, otca_off, field, bounds);

        update_hud();
        drawer.redraw(life.root);
    }*/

    function run()
    {
        var n = 0,
            start,
            last_frame,
            frame_time = 1000 / max_fps,
            interval,
            per_frame = frame_time;

        set_text($("run_button"), "Stop");

        running = true;

        if(life.generation === 0)
        {
            life.save_rewind_state();
        }

        interval = setInterval(function()
        {
            update_hud(1000 / frame_time);
        }, 666);

        start = Date.now();
        last_frame = start - per_frame;

        function update()
        {
            if(!running)
            {
                clearInterval(interval);
                update_hud(1000 / frame_time);

                if(onstop) {
                    onstop();
                }
                return;
            }

            var time = Date.now();

            if(per_frame * n < (time - start))
            {
                life.next_generation(true);
                drawer.redraw(life.root);

                n++;

                // readability ... my ass
                frame_time += (-last_frame - frame_time + (last_frame = time)) / 15;

                if(frame_time < .7 * per_frame)
                {
                    n = 1;
                    start = Date.now();
                }
            }

            nextFrame(update);
        }

        update();
    }

    function step(is_single)
    {
        var time = Date.now();

        if(life.generation === 0)
        {
            life.save_rewind_state();
        }

        life.next_generation(is_single);
        drawer.redraw(life.root);

        update_hud(1000 / (Date.now() - time));

        if(time < 3)
        {
            set_text($("label_fps"), "> 9000");
        }
    }

    function show_alert(pattern)
    {
        if(pattern.title || pattern.comment || pattern.urls.length)
        {
            show_overlay("alert");

            set_text($("pattern_title"), pattern.title || "");
            set_text($("pattern_description"), pattern.comment || "");

            $("pattern_urls").innerHTML = "";
            for(let url of pattern.urls)
            {
                let a = document.createElement("a");
                a.href = url;
                a.textContent = url;
                a.target = "_blank";
                $("pattern_urls").appendChild(a);
                $("pattern_urls").appendChild(document.createElement("br"));
            }

            if(pattern.view_url)
            {
                show_element($("pattern_link_container"));
                set_text($("pattern_link"), pattern.view_url);
                $("pattern_link").href = pattern.view_url;
            }
            else
            {
                hide_element($("pattern_link_container"));
            }

            if(pattern.source_url)
            {
                show_element($("pattern_file_container"));
                set_text($("pattern_file_link"), pattern.source_url);
                $("pattern_file_link").href = pattern.source_url;
            }
            else
            {
                hide_element($("pattern_file_container"));
            }
        }
    }

    function show_overlay(overlay_id)
    {
        show_element($("overlay"));

        // allow scroll bars when overlay is visible
        document.body.style.overflow = "auto";

        var overlays = $("overlay").children;

        for(var i = 0; i < overlays.length; i++)
        {
            var child = overlays[i];

            if(child.id === overlay_id)
            {
                show_element(child);
            }
            else
            {
                hide_element(child);
            }
        }
    }

    function hide_overlay()
    {
        hide_element($("overlay"));
        document.body.style.overflow = "hidden";
    }

    /**
     * @param {number=} fps
     */
    function update_hud(fps)
    {
        if(fps) {
            set_text($("label_fps"), fps.toFixed(1));
        }

        set_text($("label_gen"), format_thousands(life.generation, "\u202f"));
        fix_width($("label_gen"));

        set_text($("label_pop"), format_thousands(life.root.population, "\u202f"));
        fix_width($("label_pop"));

        if(drawer.cell_width >= 1)
        {
            set_text($("label_zoom"), "1:" + drawer.cell_width);
        }
        else
        {
            set_text($("label_zoom"), 1 / drawer.cell_width + ":1");
        }
    }

    function lazy_redraw(node)
    {
        if(!running || max_fps < 15)
        {
            drawer.redraw(node);
        }
    }

    function set_text(obj, text)
    {
        obj.textContent = String(text);
    }

    /**
     * fixes the width of an element to its current size
     */
    function fix_width(element)
    {
        element.style.padding = "0";
        element.style.width = "";

        if(!element.last_width || element.last_width < element.offsetWidth) {
            element.last_width = element.offsetWidth;
        }
        element.style.padding = "";

        element.style.width = element.last_width + "px";
    }


    function validate_color(color_str)
    {
        return /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(color_str) ? color_str : false;
    }

    /**
     * @param {function(string,number)=} onerror
     */
    function http_get(url, onready, onerror)
    {
        var http = new XMLHttpRequest();

        http.onreadystatechange = function()
        {
            if(http.readyState === 4)
            {
                if(http.status === 200)
                {
                    onready(http.responseText, url);
                }
                else
                {
                    if(onerror)
                    {
                        onerror(http.responseText, http.status);
                    }
                }
            }
        };

        http.open("get", url, true);
        http.send("");

        return {
            cancel : function()
            {
                http.abort();
            }
        };
    }

    function http_get_multiple(urls, ondone, onerror)
    {
        var count = urls.length,
            done = 0,
            error = false,
            handlers;

        handlers = urls.map(function(url)
        {
            return http_get(
                url.url,
                function(result)
                {
                    // a single request was successful

                    if(error) {
                        return;
                    }

                    if(url.onready) {
                        url.onready(result);
                    }

                    done++;

                    if(done === count) {
                        ondone();
                    }
                },
                function(result, status_code)
                {
                    // a single request has errored

                    if(!error)
                    {
                        error = true;

                        onerror();

                        for(var i = 0; i < handlers.length; i++)
                        {
                            handlers[i].cancel();
                        }
                    }
                }
            );
        });
    }

    /*
     * The mousemove event which allows moving around
     */
    function do_field_move(e)
    {
        if(last_mouse_x !== null)
        {
            let dx = Math.round(e.clientX - last_mouse_x);
            let dy = Math.round(e.clientY - last_mouse_y);

            drawer.move(dx, dy);

            //lazy_redraw(life.root);

            last_mouse_x += dx;
            last_mouse_y += dy;
        }
    }

    /*
     * The mousemove event which draw pixels
     */
    function do_field_draw(e)
    {
        var coords = drawer.pixel2cell(e.clientX, e.clientY);

        // don't draw the same pixel twice
        if(coords.x !== last_mouse_x || coords.y !== last_mouse_y)
        {
            life.set_bit(coords.x, coords.y, mouse_set);
            update_hud();

            drawer.draw_cell(coords.x, coords.y, mouse_set);
            last_mouse_x = coords.x;
            last_mouse_y = coords.y;
        }
    }

    function $(id)
    {
        return document.getElementById(id);
    }

    function set_query(filename)
    {
        if(!window.history.replaceState)
        {
            return;
        }

        if(filename)
        {
            window.history.replaceState(null, "", "?pattern=" + filename);
        }
        else
        {
            window.history.replaceState(null, "", "/life/");
        }
    }

    /** @param {string=} title */
    function set_title(title)
    {
        if(title)
        {
            document.title = title + " - " + initial_title;
        }
        else
        {
            document.title = initial_title;
        }
    }

    function hide_element(node)
    {
        node.style.display = "none";
    }

    function show_element(node)
    {
        node.style.display = "block";
    }

    function pad0(str, n)
    {
        while(str.length < n)
        {
            str = "0" + str;
        }

        return str;
    }

    // Put sep as a seperator into the thousands spaces of and Integer n
    // Doesn't handle numbers >= 10^21
    function format_thousands(n, sep)
    {
        if(n < 0)
        {
            return "-" + format_thousands(-n, sep);
        }

        if(isNaN(n) || !isFinite(n) || n >= 1e21)
        {
            return n + "";
        }

        function format(str)
        {
            if(str.length < 3)
            {
                return str;
            }
            else
            {
                return format(str.slice(0, -3)) + sep + str.slice(-3);
            }
        }

        return format(n + "");
    }


    function debounce(func, timeout)
    {
        var timeout_id;

        return function()
        {
            var me = this,
                args = arguments;

            clearTimeout(timeout_id);

            timeout_id = setTimeout(function()
            {
                func.apply(me, Array.prototype.slice.call(args));
            }, timeout);
        };
    }

    function download(text, name)
    {
        var a = document.createElement("a");
        a["download"] = name;
        a.href = window.URL.createObjectURL(new Blob([text]));
        a.dataset["downloadurl"] = ["text/plain", a["download"], a.href].join(":");

        if(document.createEvent)
        {
            var ev = document.createEvent("MouseEvent");
            ev.initMouseEvent("click", true, true, window,
                0, 0, 0, 0, 0, false, false, false, false, 0, null);
            a.dispatchEvent(ev);
        }
        else
        {
            a.click();
        }

        window.URL.revokeObjectURL(a.href);
    }

})();

