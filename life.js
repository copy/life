"use strict";

var
    /** @const */
    LOAD_FACTOR = .9,
    /** @const */
    INITIAL_SIZE = 16,
    /** @const */
    HASHMAP_LIMIT = 24,

    /** @const */
    MASK_LEFT = 1,
    /** @const */
    MASK_TOP = 2,
    /** @const */
    MASK_RIGHT = 4,
    /** @const */
    MASK_BOTTOM = 8;



/** @constructor */
function LifeUniverse()
{
    // last id for nodes
    /** @type {number} */
    this.last_id = 0;

    // Size of the hashmap.
    // Always a power of 2 minus 1
    this.hashmap_size = 0;


    // Size when the next GC will happen
    this.max_load = 0;

    // the hashmap
    this.hashmap = [];

    this.empty_tree_cache = [];
    this.level2_cache = [];

    this._powers = new Float64Array(1024);
    this._powers[0] = 1;

    for(var i = 1; i < 1024; i++)
    {
        this._powers[i] = this._powers[i - 1] * 2;
    }


    this._bitcounts = new Int8Array(0x758);
    this._bitcounts.set([0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4]);

    for(var i = 0x10; i < 0x758; i++)
    {
        this._bitcounts[i] = this._bitcounts[i & 0xF] +
                                this._bitcounts[i >> 4 & 0xF] +
                                this._bitcounts[i >> 8];
    }


    // current rule setting
    /** @type {number} */
    this.rule_b = 1 << 3;
    /** @type {number} */
    this.rule_s =  1 << 2 | 1 << 3;

    this.root = null;

    this.rewind_state = null;

    /**
     * number of generations to calculate at one time,
     * written as 2^n
     * @type {number}
     */
    this.step = 0;

    // in which generation are we
    /** @type {number} */
    this.generation = 0;

    // living or dead leaf
    this.false_leaf =
    {
        id: 3,
        population: 0,
        level: 0,
    };
    this.true_leaf =
    {
        id: 2,
        population: 1,
        level: 0,
    };

    this.clear_pattern();
}

LifeUniverse.prototype.pow2 = function(x)
{
    if(x >= 1024)
        return Infinity;

    return this._powers[x];
};

LifeUniverse.prototype.save_rewind_state = function()
{
    this.rewind_state = this.root;
};

LifeUniverse.prototype.restore_rewind_state = function()
{
    this.generation = 0;
    this.root = this.rewind_state;

    // make sure to rebuild the hashmap, in case its size changed
    this.garbage_collect();
};

LifeUniverse.prototype.eval_mask = function(bitmask)
{
    var rule = (bitmask & 32) ? this.rule_s : this.rule_b;

    return rule >> this._bitcounts[bitmask & 0x757] & 1;
};

LifeUniverse.prototype.level1_create = function(bitmask)
{
    return this.create_tree(
        bitmask & 1 ? this.true_leaf : this.false_leaf,
        bitmask & 2 ? this.true_leaf : this.false_leaf,
        bitmask & 4 ? this.true_leaf : this.false_leaf,
        bitmask & 8 ? this.true_leaf : this.false_leaf
    );
};

LifeUniverse.prototype.set_bit = function(x, y, living)
{
    var level = this.get_level_from_bounds({ x: x, y: y });

    if(living)
    {
        while(level > this.root.level)
        {
            this.root = this.expand_universe(this.root);
        }
    }
    else
    {
        if(level > this.root.level) {
            // no need to delete pixels outside of the universe
            return;
        }
    }

    this.root = this.node_set_bit(this.root, x, y, living);
};

LifeUniverse.prototype.get_bit = function(x, y)
{
    var level = this.get_level_from_bounds({ x: x, y: y });

    if(level > this.root.level)
    {
        return false;
    }
    else
    {
        return this.node_get_bit(this.root, x, y);
    }
};

LifeUniverse.prototype.get_root_bounds = function()
{
    if(this.root.population === 0)
    {
        return {
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
        };
    }

    var bounds = {
            top: Infinity,
            left: Infinity,
            bottom: -Infinity,
            right: -Infinity,
        },
        offset = this.pow2(this.root.level - 1);

    this.node_get_boundary(this.root, -offset, -offset, MASK_TOP | MASK_LEFT | MASK_BOTTOM | MASK_RIGHT, bounds);

    return bounds;
};

LifeUniverse.prototype.empty_tree = function(level)
{
    if(this.empty_tree_cache[level]) {
        return this.empty_tree_cache[level];
    }

    var t;

    if(level === 1) {
        t = this.false_leaf;
    }
    else {
        t = this.empty_tree(level - 1);
    }

    return this.empty_tree_cache[level] = this.create_tree(t, t, t, t);
};

LifeUniverse.prototype.expand_universe = function(node)
{
    var t = this.empty_tree(node.level - 1);

    return this.create_tree(
        this.create_tree(t, t, t, node.nw),
        this.create_tree(t, t, node.ne, t),
        this.create_tree(t, node.sw, t, t),
        this.create_tree(node.se, t, t, t)
    );
};

// Preserve the tree, but remove all cached
// generations forward
LifeUniverse.prototype.uncache = function(also_quick)
{
    for(var i = 0; i <= this.hashmap_size; i++)
    {
        var node = this.hashmap[i];

        if(node !== undefined)
        {
            node.cache = null;
            node.hashmap_next = undefined;

            if(also_quick)
                node.quick_cache = null;
        }
    }
};


// return false if a node is in the hashmap
LifeUniverse.prototype.in_hashmap = function(n)
{
    var hash = this.calc_hash(n.nw.id, n.ne.id, n.sw.id, n.se.id) & this.hashmap_size,
        node = this.hashmap[hash];

    for(;;)
    {
        if(node === undefined)
        {
            return false;
        }
        else if(node === n)
        {
            return true;
        }

        node = node.hashmap_next;
    }
};

// insert a node into the hashmap
LifeUniverse.prototype.hashmap_insert = function(n)
{
    var hash = this.calc_hash(n.nw.id, n.ne.id, n.sw.id, n.se.id) & this.hashmap_size,
        node = this.hashmap[hash],
        prev;

    for(;;)
    {
        if(node === undefined)
        {
            if(prev !== undefined)
            {
                prev.hashmap_next = n;
            }
            else
            {
                this.hashmap[hash] = n;
            }

            return;
        }
        //else if(node === n)
        //{
        //    // Should not happen
        //}

        prev = node;
        node = node.hashmap_next;
    }
};

// create or search for a tree node given its children
LifeUniverse.prototype.create_tree = function(nw, ne, sw, se)
{
    var hash = this.calc_hash(nw.id, ne.id, sw.id, se.id) & this.hashmap_size,
        node = this.hashmap[hash],
        prev;

    for(;;)
    {
        if(node === undefined)
        {
            if(this.last_id > this.max_load)
            {
                this.garbage_collect();
                return this.create_tree(nw, ne, sw, se);
            }

            var new_node = new this.TreeNode(nw, ne, sw, se, this.last_id++);

            if(prev !== undefined)
            {
                prev.hashmap_next = new_node;
            }
            else
            {
                this.hashmap[hash] = new_node;
            }

            return new_node;
        }
        else if(node.nw === nw && node.ne === ne && node.sw === sw && node.se === se)
        {
            return node;
        }
        //console.log("collision hash=" + hash +
        //        " (" + node.nw.id + "," + node.ne.id + "," + node.sw.id + "," + node.se.id + ")" +
        //        " (" + nw.id + "," + ne.id + "," + sw.id + "," + se.id + ")");

        prev = node;
        node = node.hashmap_next;
    }
};

LifeUniverse.prototype.next_generation = function(is_single)
{
    var root = this.root;

    while(
        (is_single && root.level <= this.step + 2) ||
        root.nw.population !== root.nw.se.se.population ||
        root.ne.population !== root.ne.sw.sw.population ||
        root.sw.population !== root.sw.ne.ne.population ||
        root.se.population !== root.se.nw.nw.population)
    {
        root = this.expand_universe(root);
    }

    if(is_single)
    {
        this.generation += this.pow2(this.step);
        root = this.node_next_generation(root);
    }
    else
    {
        this.generation += this.pow2(this.root.level - 2);
        root = this.node_quick_next_generation(root);
    }

    this.root = root;
};

LifeUniverse.prototype.garbage_collect = function()
{
    //document.getElementById("pattern_name").textContent = last_id + " / " + (last_id / hashmap_size).toFixed(5);
    //console.log("entries: " + this.last_id);
    //console.log("load factor: " + this.last_id / this.hashmap_size);

    //console.log("collecting garbage ...");
    //var t = Date.now();

    if(this.hashmap_size < (1 << HASHMAP_LIMIT) - 1)
    {
        this.hashmap_size = this.hashmap_size << 1 | 1;
        this.hashmap = [];
    }

    this.max_load = this.hashmap_size * LOAD_FACTOR | 0;


    for(var i = 0; i <= this.hashmap_size; i++)
        this.hashmap[i] = undefined;

    this.last_id = 4;
    this.node_hash(this.root);

    //console.log("new entries: " + this.last_id);
    //console.log("population: " + this.root.population);
    //console.log("new hashmap size: " + this.hashmap_size);
    //console.log("GC done in " + (Date.now() - t));
    //console.log("size: " + hashmap.reduce(function(a, x) { return a + (x !== undefined); }, 0));
};

// the hash function used for the hashmap
LifeUniverse.prototype.calc_hash = function(nw_id, ne_id, sw_id, se_id)
{
    //nw_id = nw_id | 0;
    //ne_id = ne_id | 0;
    //sw_id = sw_id | 0;
    //se_id = se_id | 0;


    //var hash = 0;
    //hash = hash + nw_id | 0;
    //nw_id = ne_id + (nw_id << 6) + (nw_id << 16) - nw_id | 0;
    //nw_id = sw_id + (nw_id << 6) + (nw_id << 16) - nw_id | 0;
    //nw_id = se_id + (nw_id << 6) + (nw_id << 16) - nw_id | 0;
    //return nw_id | 0;

    var hash = ((nw_id * 23 ^ ne_id) * 23 ^ sw_id) * 23 ^ se_id;
    return hash;
};

LifeUniverse.prototype.clear_pattern = function()
{
    this.last_id = 4;
    this.hashmap_size = (1 << INITIAL_SIZE) - 1;
    this.max_load = this.hashmap_size * LOAD_FACTOR | 0;
    this.hashmap = [];
    this.empty_tree_cache = [];
    this.level2_cache = Array(0x10000);

    for(var i = 0; i <= this.hashmap_size; i++)
        this.hashmap[i] = undefined;

    this.root = this.empty_tree(3);
    this.generation = 0;
};

LifeUniverse.prototype.get_bounds = function(field_x, field_y)
{
    if(!field_x.length)
    {
        return {
            top: 0,
            left: 0,
            bottom: 0,
            right: 0
        };
    }

    var bounds = {
            top : field_y[0],
            left : field_x[0],
            bottom : field_y[0],
            right : field_x[0]
        },
        len = field_x.length;

    for(var i = 1; i < len; i++)
    {
        var x = field_x[i],
            y = field_y[i];

        if(x < bounds.left)
        {
            bounds.left = x;
        }
        else if(x > bounds.right)
        {
            bounds.right = x;
        }

        if(y < bounds.top)
        {
            bounds.top = y;
        }
        else if(y > bounds.bottom)
        {
            bounds.bottom = y;
        }
    }

    return bounds;
};

/*
 * given a point { x, y } or a bounds object { left, top, bottom, right },
 * return the quadtree level that is required to contain this point
 */
LifeUniverse.prototype.get_level_from_bounds = function(bounds)
{
    // root should always be at least level 3
    var max = 4,
        keys = Object.keys(bounds);

    for(var i = 0; i < keys.length; i++)
    {
        var coordinate = bounds[keys[i]];

        if(coordinate + 1 > max) {
            max = coordinate + 1;
        }
        else if(-coordinate > max) {
            max = -coordinate;
        }
    }

    return Math.ceil(Math.log(max) / Math.LN2) + 1;
};

LifeUniverse.prototype.field2tree = function(field, level)
{
    var tree = make_node(),
        len = field.length;

    function make_node()
    {
        return { nw: false, ne: false, sw: false, se: false };
    }

    for(var i = 0; i < len; i++)
    {
        var x = field[i].x,
            y = field[i].y,
            node = tree;

        for(var j = level - 2; j >= 0; j--)
        {
            var offset = this.pow2(j);

            if(x < 0)
            {
                x += offset;
                if(y < 0)
                {
                    y += offset;
                    if(!node.nw) {
                        node.nw = make_node();
                    }
                    node = node.nw;
                }
                else
                {
                    y -= offset;
                    if(!node.sw) {
                        node.sw = make_node();
                    }
                    node = node.sw;
                }
            }
            else
            {
                x -= offset;
                if(y < 0)
                {
                    y += offset;
                    if(!node.ne) {
                        node.ne = make_node();
                    }
                    node = node.ne;
                }
                else
                {
                    y -= offset;
                    if(!node.se) {
                        node.se = make_node();
                    }
                    node = node.se;
                }
            }
        }

        if(x < 0)
        {
            if(y < 0) {
                node.nw = true;
            }
            else {
                node.sw = true;
            }
        }
        else
        {
            if(y < 0) {
                node.ne = true;
            }
            else {
                node.se = true;
            }
        }
    }

    return tree;
};

/*
 * move a field so that (0,0) is in the middle
 */
LifeUniverse.prototype.make_center = function(field_x, field_y, bounds)
{
    var offset_x = Math.round((bounds.left - bounds.right) / 2) - bounds.left,
        offset_y = Math.round((bounds.top - bounds.bottom) / 2) - bounds.top;

    this.move_field(field_x, field_y, offset_x, offset_y);

    bounds.left += offset_x;
    bounds.right += offset_x;
    bounds.top += offset_y;
    bounds.bottom += offset_y;
};

LifeUniverse.prototype.move_field = function(field_x, field_y, offset_x, offset_y)
{
    var len = field_x.length;

    for(var i = 0; i < len; i++)
    {
        field_x[i] += offset_x;
        field_y[i] += offset_y;
    }
};

/** @param {*=} bounds */
LifeUniverse.prototype.setup_field = function(field_x, field_y, bounds)
{
    if(bounds === undefined) {
        bounds = this.get_bounds(field_x, field_y);
    }

    var level = this.get_level_from_bounds(bounds),
        offset = this.pow2(level - 1),
        count = field_x.length;

    //console.log(field_x, field_y);
    this.move_field(field_x, field_y, offset, offset);

    //console.time("setup");

    //console.time("setup");
    this.root = this.setup_field_recurse(0, count - 1, field_x, field_y, level);
    //console.timeEnd("setup");

    //console.log("entries: " + this.last_id);
    //console.profileEnd("setup");
};

LifeUniverse.prototype.partition = function(start, end, test_field, other_field, offset)
{
    // Like quicksort's partition: Seperate the values from start to end by
    // the bitmask in offset in the array test_field, returning the middle
    var i = start,
        j = end,
        swap;

    while(i <= j)
    {
        while(i <= end && (test_field[i] & offset) === 0)
        {
            i++;
        }

        while(j > start && (test_field[j] & offset))
        {
            j--;
        }

        if(i >= j)
        {
            break;
        }

        swap = test_field[i];
        test_field[i] = test_field[j];
        test_field[j] = swap;

        swap = other_field[i];
        other_field[i] = other_field[j];
        other_field[j] = swap;

        i++;
        j--;
    }

    return i;
};

LifeUniverse.prototype.setup_field_recurse = function(start, end, field_x, field_y, level)
{
    if(start > end)
    {
        return this.empty_tree(level);
    }

    if(level === 2)
    {
        return this.level2_setup(start, end, field_x, field_y);
    }

    level--;

    var offset = 1 << level,
        // here we split the field from start to end into 4 parts:
        //   [Start, part2] -> nw
        //   [Part2, part3] -> ne
        //   [Part3, part4] -> sw
        //   [Part4, end  ] -> se
        //
        // First we split [start, end] into north and south by partitioning
        // by the y coordinates. Next we split the two halfes by the x coordinate.
        part3 = this.partition(start, end,       field_y, field_x, offset),
        part2 = this.partition(start, part3 - 1, field_x, field_y, offset),
        part4 = this.partition(part3, end,       field_x, field_y, offset);


    return this.create_tree(
        this.setup_field_recurse(start, part2 - 1, field_x, field_y, level),
        this.setup_field_recurse(part2, part3 - 1, field_x, field_y, level),
        this.setup_field_recurse(part3, part4 - 1, field_x, field_y, level),
        this.setup_field_recurse(part4, end,       field_x, field_y, level)
    );
};

LifeUniverse.prototype.level2_setup = function(start, end, field_x, field_y)
{
    var set = 0,
        x,
        y;

    for(var i = start; i <= end; i++)
    {
        x = field_x[i];
        y = field_y[i];

        // interleave 2-bit x and y values
        set |= 1 << (x & 1 | (y & 1 | x & 2) << 1 | (y & 2) << 2);
        //set |= 1 << ((0xA820 >> ((y & 3) << 2) | 0x5410 >> ((x & 3) << 2) & 15));
    }

    if(this.level2_cache[set])
    {
        return this.level2_cache[set];
    }

    return this.level2_cache[set] = this.create_tree(
        this.level1_create(set),
        this.level1_create(set >> 4),
        this.level1_create(set >> 8),
        this.level1_create(set >> 12)
    );
};

LifeUniverse.prototype.setup_meta = function(otca_on, otca_off, field, bounds)
{
    var level = this.get_level_from_bounds(bounds),
        node = this.field2tree(field, level);

    this.root = setup_meta_from_tree(node, level + 11);

    function setup_meta_from_tree(node, level)
    {
        if(level === 11)
        {
            return node ? otca_on : otca_off;
        }
        else if(!node)
        {
            var dead = setup_meta_from_tree(false, level - 1);

            return this.create_tree(dead, dead, dead, dead);
        }
        else
        {
            level--;

            return this.create_tree(
                setup_meta_from_tree(node.nw, level),
                setup_meta_from_tree(node.ne, level),
                setup_meta_from_tree(node.sw, level),
                setup_meta_from_tree(node.se, level)
            );
        }
    }
};


//LifeUniverse.prototype.get_field = function(node)
//{
//    var offset = this.pow2(node.level - 1),
//        field = [];
//
//    this.node_get_field(node, -offset, -offset, field);
//    //node.get_field(-offset, -offset, field);
//
//    return field;
//};

// set the base step for generations forward
LifeUniverse.prototype.set_step = function(step)
{
    if(step !== this.step)
    {
        this.step = step;

        this.uncache(false);
        this.empty_tree_cache = [];
        this.level2_cache = Array(0x10000);
    }
};

LifeUniverse.prototype.set_rules = function(s, b)
{
    if(this.rule_s !== s || this.rule_b !== b)
    {
        this.rule_s = s;
        this.rule_b = b;

        this.uncache(true);
        this.empty_tree_cache = [];
        this.level2_cache = Array(0x10000);
    }
};

/**
 * @constructor
 */
LifeUniverse.prototype.TreeNode = function(nw, ne, sw, se, id)
{
    this.nw = nw;
    this.ne = ne;
    this.sw = sw;
    this.se = se;

    this.id = id;

    // 2^level = width/height of area
    this.level = nw.level + 1;

    this.population = nw.population + ne.population + sw.population + se.population;

    // one generation forward
    this.cache = null;

    // 2^(level - 2) generations forward
    this.quick_cache = null;

    // next entry in the hashmap if this node occupies the same slot
    this.hashmap_next = undefined;

    /*if(this.population === 0)
    {
        this.cache = this.quick_cache = nw;
    }*/
};

LifeUniverse.prototype.node_set_bit = function(node, x, y, living)
{
    if(node.level === 0)
    {
        return living ? this.true_leaf : this.false_leaf;
    }

    var offset = node.level === 1 ? 0 : this.pow2(node.level - 2),
        nw = node.nw,
        ne = node.ne,
        sw = node.sw,
        se = node.se;

    if(x < 0)
    {
        if(y < 0)
        {
            nw = this.node_set_bit(nw, x + offset, y + offset, living);
        }
        else
        {
            sw = this.node_set_bit(sw, x + offset, y - offset, living);
        }
    }
    else
    {
        if(y < 0)
        {
            ne = this.node_set_bit(ne, x - offset, y + offset, living);
        }
        else
        {
            se = this.node_set_bit(se, x - offset, y - offset, living);
        }
    }

    return this.create_tree(nw, ne, sw, se);
};

LifeUniverse.prototype.node_get_bit = function(node, x, y)
{
    if(node.population === 0)
    {
        return false;
    }
    if(node.level === 0)
    {
        // other level 0 case is handled above
        return true;
    }

    var offset = node.level === 1 ? 0 : this.pow2(node.level - 2);

    if(x < 0)
    {
        if (y < 0)
        {
            return this.node_get_bit(node.nw, x + offset, y + offset);
        }
        else
        {
            return this.node_get_bit(node.sw, x + offset, y - offset);
        }
    }
    else
    {
        if(y < 0)
        {
            return this.node_get_bit(node.ne, x - offset, y + offset);
        }
        else
        {
            return this.node_get_bit(node.se, x - offset, y - offset);
        }
    }
};

LifeUniverse.prototype.node_get_field = function(node, left, top, field)
{
    if(node.population === 0)
    {
        return;
    }

    if(node.level === 0)
    {
        field.push({ x: left, y: top });
    }
    else
    {
        var offset = this.pow2(node.level - 1);

        this.node_get_field(node.nw, left, top, field);
        this.node_get_field(node.sw, left, top + offset, field);
        this.node_get_field(node.ne, left + offset, top, field);
        this.node_get_field(node.se, left + offset, top + offset, field);
    }
};

LifeUniverse.prototype.node_level2_next = function(node)
{
    var nw = node.nw,
        ne = node.ne,
        sw = node.sw,
        se = node.se,
        bitmask =
            nw.nw.population << 15 | nw.ne.population << 14 | ne.nw.population << 13 | ne.ne.population << 12 |
            nw.sw.population << 11 | nw.se.population << 10 | ne.sw.population <<  9 | ne.se.population <<  8 |
            sw.nw.population <<  7 | sw.ne.population <<  6 | se.nw.population <<  5 | se.ne.population <<  4 |
            sw.sw.population <<  3 | sw.se.population <<  2 | se.sw.population <<  1 | se.se.population;


    return this.level1_create(
        this.eval_mask(bitmask >> 5) |
        this.eval_mask(bitmask >> 4) << 1 |
        this.eval_mask(bitmask >> 1) << 2 |
        this.eval_mask(bitmask) << 3
    );

};

LifeUniverse.prototype.node_next_generation = function(node)
{
    if(node.cache)
    {
        return node.cache;
    }

    if(this.step === node.level - 2)
    {
        return this.node_quick_next_generation(node);
    }

    if(node.level === 2)
    {
        if(node.quick_cache)
        {
            return node.quick_cache;
        }
        else
        {
            return node.quick_cache = this.node_level2_next(node);
        }
    }

    var nw = node.nw,
        ne = node.ne,
        sw = node.sw,
        se = node.se,
        n00 = this.create_tree(nw.nw.se, nw.ne.sw, nw.sw.ne, nw.se.nw),
        n01 = this.create_tree(nw.ne.se, ne.nw.sw, nw.se.ne, ne.sw.nw),
        n02 = this.create_tree(ne.nw.se, ne.ne.sw, ne.sw.ne, ne.se.nw),
        n10 = this.create_tree(nw.sw.se, nw.se.sw, sw.nw.ne, sw.ne.nw),
        n11 = this.create_tree(nw.se.se, ne.sw.sw, sw.ne.ne, se.nw.nw),
        n12 = this.create_tree(ne.sw.se, ne.se.sw, se.nw.ne, se.ne.nw),
        n20 = this.create_tree(sw.nw.se, sw.ne.sw, sw.sw.ne, sw.se.nw),
        n21 = this.create_tree(sw.ne.se, se.nw.sw, sw.se.ne, se.sw.nw),
        n22 = this.create_tree(se.nw.se, se.ne.sw, se.sw.ne, se.se.nw);

    return node.cache = this.create_tree(
        this.node_next_generation(this.create_tree(n00, n01, n10, n11)),
        this.node_next_generation(this.create_tree(n01, n02, n11, n12)),
        this.node_next_generation(this.create_tree(n10, n11, n20, n21)),
        this.node_next_generation(this.create_tree(n11, n12, n21, n22))
    );
};

LifeUniverse.prototype.node_quick_next_generation = function(node)
{
    if(node.quick_cache !== null)
    {
        return node.quick_cache;
    }

    if(node.level === 2)
    {
        return node.quick_cache = this.node_level2_next(node);
    }

    var nw = node.nw,
        ne = node.ne,
        sw = node.sw,
        se = node.se,
        n00 = this.node_quick_next_generation(nw),
        n01 = this.node_quick_next_generation(this.create_tree(nw.ne, ne.nw, nw.se, ne.sw)),
        n02 = this.node_quick_next_generation(ne),
        n10 = this.node_quick_next_generation(this.create_tree(nw.sw, nw.se, sw.nw, sw.ne)),
        n11 = this.node_quick_next_generation(this.create_tree(nw.se, ne.sw, sw.ne, se.nw)),
        n12 = this.node_quick_next_generation(this.create_tree(ne.sw, ne.se, se.nw, se.ne)),
        n20 = this.node_quick_next_generation(sw),
        n21 = this.node_quick_next_generation(this.create_tree(sw.ne, se.nw, sw.se, se.sw)),
        n22 = this.node_quick_next_generation(se);


    return node.quick_cache = this.create_tree(
        this.node_quick_next_generation(this.create_tree(n00, n01, n10, n11)),
        this.node_quick_next_generation(this.create_tree(n01, n02, n11, n12)),
        this.node_quick_next_generation(this.create_tree(n10, n11, n20, n21)),
        this.node_quick_next_generation(this.create_tree(n11, n12, n21, n22))
    );
};

LifeUniverse.prototype.node_hash = function(node)
{
    if(!this.in_hashmap(node))
    {
        // Update the id. We have looked for an old id, as
        // the the hashmap has been cleared and ids have been
        // reset, but this cannot avoided without iterating
        // the tree twice.
        node.id = this.last_id++;
        node.hashmap_next = undefined;

        if(node.level > 1)
        {
            this.node_hash(node.nw);
            this.node_hash(node.ne);
            this.node_hash(node.sw);
            this.node_hash(node.se);

            if(node.cache) {
                this.node_hash(node.cache);
            }
            if(node.quick_cache) {
                this.node_hash(node.quick_cache);
            }
        }

        this.hashmap_insert(node);
    }
};

LifeUniverse.prototype.node_get_boundary = function(node, left, top, find_mask, boundary)
{
    if(node.population === 0 || !find_mask)
    {
        return;
    }

    if(node.level === 0)
    {
        if(left < boundary.left)
            boundary.left = left;
        if(left > boundary.right)
            boundary.right = left;

        if(top < boundary.top)
            boundary.top = top;
        if(top > boundary.bottom)
            boundary.bottom = top;
    }
    else
    {
        var offset = this.pow2(node.level - 1);

        if(left >= boundary.left && left + offset * 2 <= boundary.right &&
            top >= boundary.top && top + offset * 2 <= boundary.bottom)
        {
            // this square is already inside the found boundary
            return;
        }

        var find_nw = find_mask,
            find_sw = find_mask,
            find_ne = find_mask,
            find_se = find_mask;

        if(node.nw.population)
        {
            find_sw &= ~MASK_TOP;
            find_ne &= ~MASK_LEFT;
            find_se &= ~MASK_TOP & ~MASK_LEFT;
        }
        if(node.sw.population)
        {
            find_se &= ~MASK_LEFT;
            find_nw &= ~MASK_BOTTOM;
            find_ne &= ~MASK_BOTTOM & ~MASK_LEFT;
        }
        if(node.ne.population)
        {
            find_nw &= ~MASK_RIGHT;
            find_se &= ~MASK_TOP;
            find_sw &= ~MASK_TOP & ~MASK_RIGHT;
        }
        if(node.se.population)
        {
            find_sw &= ~MASK_RIGHT;
            find_ne &= ~MASK_BOTTOM;
            find_nw &= ~MASK_BOTTOM & ~MASK_RIGHT;
        }

        this.node_get_boundary(node.nw, left, top, find_nw, boundary);
        this.node_get_boundary(node.sw, left, top + offset, find_sw, boundary);
        this.node_get_boundary(node.ne, left + offset, top, find_ne, boundary);
        this.node_get_boundary(node.se, left + offset, top + offset, find_se, boundary);
    }
};
