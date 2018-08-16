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

        canvas_width,
        canvas_height,

        // canvas contexts
        canvas,
        context,

        image_data,
        image_data_data,

        // in pixels
        border_width,
        cell_color_rgb,

        drawer = this;

    var pixel_ratio = 1;


    this.cell_color = null;
    this.background_color = null;

    // given as ratio of cell size
    this.border_width = 0;


    this.init = init;
    this.redraw = redraw;
    this.move = move;
    this.zoom_at = zoom_at;
    this.zoom_centered = zoom_centered;
    this.fit_bounds = fit_bounds;
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

        drawer.canvas = canvas;

        context = canvas.getContext("2d");

        dom_parent.appendChild(canvas);

        return true;
    }

    function set_size(width, height)
    {
        if(width !== canvas_width || height !== canvas_height)
        {
            if(true)
            {
                canvas.style.width = width + "px";
                canvas.style.height = height + "px";
                var factor = window.devicePixelRatio;
            }
            else
            {
                var factor = 1;
            }

            pixel_ratio = factor;

            // Math.round is important here: Neither floor nor ceil produce
            // sharp pixels (test by taking a screenshot at 1:1 zoom and
            // inspecting in an image editor)
            canvas.width = Math.round(width * factor);
            canvas.height = Math.round(height * factor);

            canvas_width = canvas.width;
            canvas_height = canvas.height;

            image_data = context.createImageData(canvas_width, canvas_height);
            image_data_data = new Int32Array(image_data.data.buffer);

            for(var i = 0; i < width * height; i++)
            {
                image_data_data[i] = 0xFF << 24;
            }
        }
    }

    function draw_node(node, size, left, top)
    {
        if(node.population === 0)
        {
            return;
        }

        if(
            left + size + canvas_offset_x < 0 ||
            top + size + canvas_offset_y < 0 ||
            left + canvas_offset_x >= canvas_width ||
            top + canvas_offset_y >= canvas_height
        ) {
            // do not draw outside of the screen
            return;
        }

        if(size <= 1)
        {
            if(node.population)
            {
                fill_square(left + canvas_offset_x | 0, top + canvas_offset_y | 0, 1);
            }
        }
        else if(node.level === 0)
        {
            if(node.population)
            {
                fill_square(left + canvas_offset_x, top + canvas_offset_y, drawer.cell_width);
            }
        }
        else
        {
            size /= 2;

            draw_node(node.nw, size, left, top);
            draw_node(node.ne, size, left + size, top);
            draw_node(node.sw, size, left, top + size);
            draw_node(node.se, size, left + size, top + size);
        }
    }

    function fill_square(x, y, size)
    {
        var width = size - border_width,
            height = width;

        if(x < 0)
        {
            width += x;
            x = 0;
        }

        if(x + width > canvas_width)
        {
            width = canvas_width - x;
        }

        if(y < 0)
        {
            height += y;
            y = 0;
        }

        if(y + height > canvas_height)
        {
            height = canvas_height - y;
        }

        if(width <= 0 || height <= 0)
        {
            return;
        }

        var pointer = x + y * canvas_width,
            row_width = canvas_width - width;

        //console.assert(x >= 0 && y >= 0 && x + width <= canvas_width && y + height <= canvas_height);
        var color = cell_color_rgb.r | cell_color_rgb.g << 8 | cell_color_rgb.b << 16 | 0xFF << 24;

        for(var i = 0; i < height; i++)
        {
            for(var j = 0; j < width; j++)
            {
                image_data_data[pointer] = color;

                pointer++;
            }
            pointer += row_width;
        }
    }


    function redraw(node)
    {
        var bg_color_rgb = color2rgb(drawer.background_color);
        var bg_color_int = bg_color_rgb.r | bg_color_rgb.g << 8 | bg_color_rgb.b << 16 | 0xFF << 24;

        border_width = drawer.border_width * drawer.cell_width | 0;
        cell_color_rgb = color2rgb(drawer.cell_color);

        var count = canvas_width * canvas_height;

        for(var i = 0; i < count; i++)
        {
            image_data_data[i] = bg_color_int;
        }

        var size = Math.pow(2, node.level - 1) * drawer.cell_width;

        draw_node(node, 2 * size, -size, -size);

        context.putImageData(image_data, 0, 0);
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

    /**
     * @param {number} center_x
     * @param {number} center_y
     */
    function zoom_at(out, center_x, center_y)
    {
        zoom(out, center_x * pixel_ratio, center_y * pixel_ratio);
    }

    function zoom_centered(out)
    {
        zoom(out, canvas_width >> 1, canvas_height >> 1);
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
        canvas_offset_x = canvas_width >> 1;
        canvas_offset_y = canvas_height >> 1;
    }

    function move(dx, dy)
    {
        canvas_offset_x += Math.round(dx * pixel_ratio);
        canvas_offset_y += Math.round(dy * pixel_ratio);

        // This code is faster for patterns with a huge density (for instance, spacefiller)
        // It causes jitter for all other patterns though, that's why the above version is preferred

        //context.drawImage(canvas, dx, dy);

        //if(dx < 0)
        //{
        //    redraw_part(node, canvas_width + dx, 0, -dx, canvas_height);
        //}
        //else if(dx > 0)
        //{
        //    redraw_part(node, 0, 0, dx, canvas_height);
        //}

        //if(dy < 0)
        //{
        //    redraw_part(node, 0, canvas_height + dy, canvas_width, -dy);
        //}
        //else if(dy > 0)
        //{
        //    redraw_part(node, 0, 0, canvas_width, dy);
        //}
    }

    function fit_bounds(bounds)
    {
        var width = bounds.right - bounds.left,
            height = bounds.bottom - bounds.top,
            relative_size,
            x,
            y;

        if(isFinite(width) && isFinite(height))
        {
            relative_size = Math.min(
                16, // maximum cell size
                canvas_width / width, // relative width
                canvas_height / height // relative height
            );
            zoom_to(relative_size);

            x = Math.round(canvas_width / 2 - (bounds.left + width / 2) * drawer.cell_width);
            y = Math.round(canvas_height / 2 - (bounds.top + height / 2) * drawer.cell_width);
        }
        else
        {
            // can happen if the pattern is empty or very large
            zoom_to(16);

            x = canvas_width >> 1;
            y = canvas_height >> 1;
        }

        canvas_offset_x = x;
        canvas_offset_y = y;
    }

    function draw_cell(x, y, set)
    {
        var cell_x = x * drawer.cell_width + canvas_offset_x,
            cell_y = y * drawer.cell_width + canvas_offset_y,
            width = Math.ceil(drawer.cell_width) -
                (drawer.cell_width * drawer.border_width | 0);

        if(set) {
            context.fillStyle = drawer.cell_color;
        }
        else {
            context.fillStyle = drawer.background_color;
        }

        context.fillRect(cell_x, cell_y, width, width);
    }

    function pixel2cell(x, y)
    {
        return {
            x : Math.floor((x * pixel_ratio - canvas_offset_x + drawer.border_width / 2) / drawer.cell_width),
            y : Math.floor((y * pixel_ratio - canvas_offset_y + drawer.border_width / 2) / drawer.cell_width)
        };
    }

    // #321 or #332211 to { r: 0x33, b: 0x22, g: 0x11 }
    function color2rgb(color)
    {
        if(color.length === 4)
        {
            return {
                r: parseInt(color[1] + color[1], 16),
                g: parseInt(color[2] + color[2], 16),
                b: parseInt(color[3] + color[3], 16)
            };
        }
        else
        {
            return {
                r: parseInt(color.slice(1, 3), 16),
                g: parseInt(color.slice(3, 5), 16),
                b: parseInt(color.slice(5, 7), 16)
            };
        }
    }
}
