"use strict";

/** @constructor */
function LifeCanvasDrawer()
{

    var

        // where is the viewport in pixels, from 0,0
        /** @type {number} */
        canvas_offset_x = 0,
        /** @type {number} */
        canvas_offset_y = 0,

        // canvas contexts
        canvas,
        context,

        bg_canvas,
        bg_context,

        fg_context,
        offscreen_canvas,

        /** effective visible part of the canvas, in x/y of the pattern */
        screen_left, screen_top, screen_right, screen_bottom,

        drawer = this;

    // size of the viewport in pixels
    /** @type {number} */
    this.width = 0;
    /** @type {number} */
    this.height = 0;


    this.init = init;
    this.redraw = redraw;
    this.redraw_bg = redraw_bg;
    this.move = move;
    this.zoom = zoom;
    this.zoom_centered = zoom_centered;
    this.set_size = set_size;
    this.draw_cell = draw_cell;
    this.center_view = center_view;
    this.zoom_to = zoom_to;
    this.pixel2cell = pixel2cell;



    function init(dom_parent)
    {
        canvas = document.createElement("canvas");

        if(!canvas.getContext) {
            return false;
        }

        drawer.canvas = bg_canvas = document.createElement("canvas");
        offscreen_canvas = document.createElement("canvas");
        
        context = offscreen_canvas.getContext("2d");
        bg_context = bg_canvas.getContext("2d");

        bg_canvas.style.position = "absolute"; 
        bg_canvas.style.top = bg_canvas.style.left = "0px";

        fg_context = canvas.getContext("2d");

        dom_parent.appendChild(canvas);
        dom_parent.appendChild(bg_canvas);

        return true;
    }

    function set_size(width, height)
    {
        if(width !== canvas.width || height !== canvas.height)
        {
            offscreen_canvas.width = bg_canvas.width = canvas.width = width;
            offscreen_canvas.height = bg_canvas.height = canvas.height = height;
            
            context.fillStyle = drawer.cell_color;
        }
    }

    function draw_node(node, left, top)
    {
        if(node.population === 0)
        {
            return;
        }
        
        var offset = pow2(node.level - 1),
            offset2 = offset * 2;
        
        if( 
            left + offset2 < screen_left ||
            top + offset2 < screen_top ||
            left > screen_right ||
            top > screen_bottom
        ) {
            // do not draw outside of the screen
            return;
        }

        if(node.level === 0)
        {
            if(node.population)
            {
                context.fillRect(
                    canvas_offset_x + left * drawer.cell_width,
                    canvas_offset_y + top * drawer.cell_width,
                    drawer.cell_width,
                    drawer.cell_width
                );
            }
        }
        else if(offset2 * drawer.cell_width <= 1)
        {
            if(node.population)
            {
                context.fillRect(
                    canvas_offset_x + left * drawer.cell_width | 0,
                    canvas_offset_y + top * drawer.cell_width | 0,
                    1,
                    1
                );
            }
        }
        else
        {
            draw_node(node.nw, left, top);
            draw_node(node.ne, left + offset, top);
            draw_node(node.sw, left, top + offset);
            draw_node(node.se, left + offset, top + offset);
        }
    }

    function redraw_part(node, x, y, width, height)
    {
        // compute some variables that are used in the redrawing process
        screen_left = Math.floor((x - canvas_offset_x) / drawer.cell_width);
        screen_top = Math.floor((y - canvas_offset_y) / drawer.cell_width);
        screen_right = Math.ceil((x - canvas_offset_x + width) / drawer.cell_width); 
        screen_bottom = Math.ceil((y - canvas_offset_y + height) / drawer.cell_width);

        context.fillStyle = drawer.background_color;
        context.fillRect(x, y, width, height);
        context.fillStyle = drawer.cell_color;

        var offset = pow2(node.level - 1);
        
        draw_node(node, -offset, -offset);

        fg_context.drawImage(offscreen_canvas, x, y, width, height, x, y, width, height);
    }

    function redraw(node)
    {
        redraw_part(node, 0, 0, canvas.width, canvas.height);
    }

    function redraw_bg()
    {
        var border_width = drawer.border_width * drawer.cell_width | 0;

        bg_context.clearRect(0, 0, canvas.width, canvas.height);

        if(border_width === 0) {
            return;
        }
        
        bg_context.fillStyle = drawer.border_color;
        
        var x = canvas_offset_x % drawer.cell_width - border_width;
        for(; x < canvas.width; x += drawer.cell_width)
        {
            bg_context.fillRect(x, 0, border_width, canvas.height);
        }
        
        var y = canvas_offset_y % drawer.cell_width - border_width;
        for(; y < canvas.height; y += drawer.cell_width)
        {
            bg_context.fillRect(0, y, canvas.width, border_width);
        }
        
        bg_context.fillStyle = drawer.cell_color;
    }

    /** 
     * @param {number} center_x
     * @param {number} center_y 
     */
    function zoom(out, center_x, center_y)
    {
        if(out)
        {
            canvas_offset_x -= Math.round((canvas_offset_x - center_x) / 2);
            canvas_offset_y -= Math.round((canvas_offset_y - center_y) / 2);
            
            drawer.cell_width /= 2;
        }
        else
        {
            canvas_offset_x += Math.round(canvas_offset_x - center_x);
            canvas_offset_y += Math.round(canvas_offset_y - center_y);
            
            drawer.cell_width *= 2;
        }
    }

    function zoom_centered(out)
    {
        zoom(out, canvas.width >> 1, canvas.height >> 1);
    }

    /*
     * set zoom to the given level, rounding down
     */
    function zoom_to(level)
    {
        while(drawer.cell_width > level)
        {
            zoom_centered(true);
        }

        while(drawer.cell_width * 2 < level)
        {
            zoom_centered(false);
        }
    }

    function center_view()
    {
        canvas_offset_x = canvas.width >> 1;
        canvas_offset_y = canvas.height >> 1;
    }

    function move(node, dx, dy)
    {
        canvas_offset_x += dx;
        canvas_offset_y += dy;

        fg_context.drawImage(canvas, dx, dy);

        if(dx < 0)
        {
            redraw_part(node, canvas.width + dx, 0, -dx, canvas.height);
        }
        else if(dx > 0)
        {
            redraw_part(node, 0, 0, dx, canvas.height);
        }

        if(dy < 0)
        {
            redraw_part(node, 0, canvas.height + dy, canvas.width, -dy);
        }
        else if(dy > 0)
        {
            redraw_part(node, 0, 0, canvas.width, dy);
        }

        drawer.redraw_bg();
    }

    function draw_cell(x, y, set)
    {
        var cell_x = x * drawer.cell_width + canvas_offset_x,
            cell_y = y * drawer.cell_width + canvas_offset_y;

        if(set) {
            fg_context.fillStyle = drawer.cell_color;
        }
        else {
            fg_context.fillStyle = drawer.background_color;
        }

        fg_context.fillRect(cell_x, cell_y, drawer.cell_width, drawer.cell_width);
    }

    function pixel2cell(x, y)
    {
        return {
            x : Math.floor((x - canvas_offset_x + drawer.border_width / 2) / drawer.cell_width),
            y : Math.floor((y - canvas_offset_y + drawer.border_width / 2) / drawer.cell_width)
        };
    }
}

