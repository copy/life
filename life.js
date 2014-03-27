"use strict";

var 
    /** @const */
    LOAD_FACTOR = .6,
    /** @const */
    INITIAL_SIZE = 16,
    /** @const */
    HASHMAP_LIMIT = 24;



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


    // living or dead leaf
    //this.true_leaf = null;
    //this.false_leaf = null;

    // the hashmap
    this.hashmap = [];


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

    /** 
     * number of generations to calculate at one time,
     * written as 2^n
     * @type {number}
     */
    this.step = 0;

    // in which generation are we
    /** @type {number} */
    this.generation = 0;

    /*
    this.get_bounds = get_bounds;
    this.clear_pattern = clear_pattern;
    this.make_center = make_center;
    this.setup_field = setup_field;
    this.move_field = move_field;
    this.setup_meta = setup_meta;
    this.set_step = set_step;
    this.set_rules = set_rules;
    this.set_bit = set_bit;
    this.get_bit = get_bit;
    this.next_generation = next_generation;
    */

            
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
}

LifeUniverse.prototype.pow2 = function(x)
{
    if(x >= 1024)
        return Infinity;

    return this._powers[x];
};

LifeUniverse.prototype.eval_mask = function(bitmask)
{
    var rule = (bitmask & 32) ? this.rule_s : this.rule_b;
    
    if(rule & 1 << this._bitcounts[bitmask & 0x757])
    {
        return this.true_leaf;
    }
    else
    {
        return this.false_leaf;
    }
}


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
            return;
        }
    }
    
    this.root = this.node_set_bit(this.root, x, y, living);
}

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
}

LifeUniverse.prototype.empty_tree = function(level)
{
    if(level === 0) {
        return this.false_leaf;
    }
        
    var t = this.empty_tree(level - 1);
        
    return this.create_tree(t, t, t, t);
}

LifeUniverse.prototype.expand_universe = function(node)
{
    var t = this.empty_tree(node.level - 1);
    
    return this.create_tree(
        this.create_tree(t, t, t, node.nw),
        this.create_tree(t, t, node.ne, t),
        this.create_tree(t, node.sw, t, t),
        this.create_tree(node.se, t, t, t)
    );
}

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

            if(also_quick)
                node.quick_cache = null;
        }
    }
}


// Hash a node, return false if it was hashed before.
LifeUniverse.prototype.add_hash = function(n)
{
    var hash = this.calc_hash(n.nw.id, n.ne.id, n.sw.id, n.se.id);

    for(var node;;)
    {
        hash &= this.hashmap_size;

        var node = this.hashmap[hash];

        if(node === undefined)
        {
            // Update the id. We have looked for an old id, as
            // the the hashmap has been cleared and ids have been
            // reset, but this cannot avoided without iterating
            // the tree twice.
            n.id = this.last_id++;

            this.hashmap[hash] = n;

            return true;
        }
        else if(node.nw === n.nw && node.ne === n.ne && node.sw === n.sw && node.se === n.se)
        {
            return false;
        }

        hash++;
    }
}

LifeUniverse.prototype.create_tree = function(nw, ne, sw, se)
{
    var hash = this.calc_hash(nw.id, ne.id, sw.id, se.id);

    for(var node;;)
    {
        hash &= this.hashmap_size;

        var node = this.hashmap[hash];

        if(node === undefined)
        {
            if(this.last_id > this.max_load)
            {
                this.garbage_collect();
                return this.create_tree(nw, ne, sw, se);
            }

            return this.hashmap[hash] = new TreeNode(nw, ne, sw, se, this.last_id++);
        }
        else if(node.nw === nw && node.ne === ne && node.sw === sw && node.se === se)
        {
            return node;
        }
        //console.log("collision hash=" + hash + 
        //        " (" + node.nw.id + "," + node.ne.id + "," + node.sw.id + "," + node.se.id + ")" +
        //        " (" + nw.id + "," + ne.id + "," + sw.id + "," + se.id + ")");

        // "Open Addressing" - simply try the next cell
        hash++;
    }

    // "normal" buckets
    /*
    var entry = hashmap[hash],
        node;
    
    if(entry === undefined)
    {
        return hashmap[hash] = new TreeNode(nw, ne, sw, se);
    }
    else if(entry instanceof Array)
    {
        if(x < entry.length) x = entry.length, y = [nw, ne, sw, se, hash];
        for(var i = 0; i < entry.length; i++)
        {
            node = entry[i];

            if(node.nw === nw && node.ne === ne && node.sw === sw && node.se === se)
            {
                return node;
            }
        }

        node = new TreeNode(nw, ne, sw, se);

        entry.push(node);

        return node;
    }
    else
    {
        if(entry.nw === nw && entry.ne === ne && entry.sw === sw && entry.se === se)
        {
            return entry;
        }
        else
        {
            node = new TreeNode(nw, ne, sw, se);

            hashmap[hash] = [entry, node];

            return node;
        }
    }/* */
}


LifeUniverse.prototype.next_generation = function(is_single)
{
    var root = this.root;

    while(
        (is_single && this.step > root.level - 2) || 
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
}

LifeUniverse.prototype.garbage_collect = function()
{
    //document.getElementById("pattern_name").textContent = last_id + " / " + (last_id / hashmap_size).toFixed(5);
    //console.log("entries: " + last_id);
    //console.log("load factor: " + last_id / hashmap_size);

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

    //console.log("last id: " + last_id);
    //console.log("new hashmap size: " + hashmap_size);
    //console.log("GC done in " + (Date.now() - t));
    //console.log("size: " + hashmap.reduce(function(a, x) { return a + (x !== undefined); }, 0));
}

/*
function garbage_collect()
{
    var previous_size = hashmap_size,
        new_hashmap = [];
    
    hashmap_size = hashmap_size << 1 | 1;
    max_load = hashmap_size * LOAD_FACTOR | 0;

    for(var i = 0; i <= hashmap_size; i++)
    {
        new_hashmap[i] = undefined
    }

    for(var i = 0; i <= previous_size; i++)
    {
        var node = hashmap[i],
            hash;

        if(node !== undefined)
        {
            hash = calc_hash(node.nw.id, node.ne.id, node.sw.id, node.se.id);

            for(;;)
            {
                hash &= hashmap_size;

                if(new_hashmap[i] === undefined)
                {
                    new_hashmap[i] = node;
                    break;
                }

                hash++;
            }
        }
    }
    console.log("Garbage collected!");
    console.log("Last id: " + last_id);
    console.log("old size: " + hashmap.reduce(function(a, x) { return a + (x !== undefined); }, 0));
    console.log("new size: " + new_hashmap.reduce(function(a, x) { return a + (x !== undefined); }, 0));

    hashmap = new_hashmap;
}*/

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
    

    return ((nw_id * 23 ^ ne_id) * 23 ^ sw_id) * 23 ^ se_id;
}

LifeUniverse.prototype.clear_pattern = function()
{
    this.last_id = 4;
    this.hashmap_size = (1 << INITIAL_SIZE) - 1;
    this.max_load = this.hashmap_size * LOAD_FACTOR | 0;
    this.hashmap = [];

    for(var i = 0; i <= this.hashmap_size; i++)
        this.hashmap[i] = undefined;

    this.root = this.empty_tree(3);
    this.generation = 0;
}

LifeUniverse.prototype.get_bounds = function(field)
{
    if(!field.length)
    {
        return {
            top: 0,
            left: 0,
            bottom: 0,
            right: 0
        };
    }

    var bounds = {
            top : field[0].y, 
            left : field[0].x, 
            bottom : field[0].y, 
            right : field[0].x
        },
        len = field.length;
    
    for(var i = 1; i < len; i++)
    {
        var x = field[i].x,
            y = field[i].y;
        
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
}

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
}

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
}

/*
 * move a field so that (0,0) is in the middle
 */
LifeUniverse.prototype.make_center = function(field, bounds)
{
    var offset_x = Math.round((bounds.left - bounds.right) / 2) - bounds.left,
        offset_y = Math.round((bounds.top - bounds.bottom) / 2) - bounds.top;

    this.move_field(field, offset_x, offset_y);

    bounds.left += offset_x;
    bounds.right += offset_x;
    bounds.top += offset_y;
    bounds.bottom += offset_y;
}

LifeUniverse.prototype.move_field = function(field, offset_x, offset_y)
{
    var len = field.length;

    for(var i = 0; i < len; i++)
    {
        field[i].x += offset_x;
        field[i].y += offset_y;
    }
}

/** @param {*=} bounds */
LifeUniverse.prototype.setup_field = function(field, bounds)
{
    if(!bounds) {
        bounds = this.get_bounds(field);
    }

    var level = this.get_level_from_bounds(bounds),
        offset = this.pow2(level) / 2;

    for(var i = 0; i < field.length; i++)
    {
        field[i].x += offset;
        field[i].y += offset;
    }
    
    //var t = Date.now();
    this.quick_sort(field, 0, field.length - 1);
    //console.log("sort: " + (Date.now() - t));
    var t = Date.now();

    this.root = this.setup_field_recurse(0, field.length, field, level);
    //console.log("setup: " + (Date.now() - t));


    // Different setup to load a pattern:
    // (a bit slower)

    //var t = Date.now();
    //var level = get_level_from_bounds(bounds),
    //    node = this.field2tree(field, level);

    //console.log("field to tree " + (Date.now() - t));

    //t = Date.now();

    //this.root = setup_field_from_tree(node, level);
    //console.log("setup field " + (Date.now() - t));
}

LifeUniverse.prototype.setup_field_recurse = function(start, end, field, level)
{
    if(level === 0)
    {
        return start === end ? this.false_leaf : this.true_leaf;
    }

    if(start === end)
    {
        return this.empty_tree(level);
    }

    //console.assert(start < end);

    if(false)
    {
        var offset = this.pow2(level - 1),
            part1,
            part2 = start + (end - start >> 1),
            part3;

        //console.log(part2, start, end);

        if(field[part2].y & offset)
        {
            while(part2 > start && (field[part2].y & offset))
            {
                part2--;
            }
        }
        else
        {
            while(part2 < end - 1)
            {
                part2++;

                if(field[part2].y & offset)
                {
                    part2--;
                    break;
                }
            }
        }

        part1 = start + (part2 - start >> 1);

        if(field[part1].x & offset)
        {
            while(part1 > start && (field[part1].x & offset))
            {
                part1--;
            }
        }
        else
        {
            while(part1 < part2 - 1)
            {
                part1++;

                if(field[part1].x & offset)
                {
                    part1--;
                    break;
                }
            }
        }

        part3 = part2 + (end - part2 >> 1);

        if(field[part3].x & offset)
        {
            while(part3 > part2 && (field[part3].x & offset))
            {
                part3--;
            }
        }
        else
        {
            while(part3 < end - 1)
            {
                part3++;

                if(field[part3].x & offset)
                {
                    part3--;
                    break;
                }
            }
        }


    }
    else if(true)
    {
        var offset = this.pow2(level - 1),
            part1,
            part2 = start,
            part3,
            min = start, 
            max = end,
            mid;

        while(min < max)
        {
            mid = min + (max - min >> 1);

            if(field[mid].y & offset)
            {
                part2 = max = mid;
            }
            else
            {
                part2 = min = mid + 1;
            }
        }

        min = part1 = start;
        max = part2;

        while(min < max)
        {
            mid = min + (max - min >> 1);

            if(field[mid].x & offset)
            {
                part1 = max = mid;
            }
            else
            {
                part1 = min = mid + 1;
            }
        }

        min = part3 = part2;
        max = end;

        while(min < max)
        {
            mid = min + (max - min >> 1);

            if(field[mid].x & offset)
            {
                part3 = max = mid;
            }
            else
            {
                part3 = min = mid + 1;
            }
        }
    }

    //else
    if(false)
    {
        var offset = this.pow2(level - 1),
            i = start,
            part1,
            part2,
            part3;

        while(i < end && ((field[i].x | field[i].y) & offset) === 0)
        {
            i++;
        }

        //part1 = i;

        while(i < end && (field[i].y & offset) === 0)
        {
            i++;
        }

        //if(i != part2)
        //console.log(i, part2, start, end, start + (end - start >> 1));
        //part2 = i;

        while(i < end && (field[i].x & offset) === 0)
        {
            i++;
        }

        //part3 = i;
    }

    level--;

    return this.create_tree(
        this.setup_field_recurse(start, part1, field, level),
        this.setup_field_recurse(part1, part2, field, level),
        this.setup_field_recurse(part2, part3, field, level),
        this.setup_field_recurse(part3, end, field, level)
    );
}

LifeUniverse.prototype.compare = function(p1, p2)
{
    var y = p1.y ^ p2.y,
        x = p1.x ^ p2.x;

    if(y < x && y < (y ^ x))
    {
        return p1.x - p2.x;
    }
    else
    {
        return p1.y - p2.y;
    }
}


LifeUniverse.prototype.partition = function(items, left, right)
{
    var pivot = items[right + left >> 1],
        i = left,
        j = right,
        swap;

    while(i <= j)
    {
        while(this.compare(items[i], pivot) < 0)
        {
            i++;
        }

        while(this.compare(items[j], pivot) > 0)
        {
            j--;
        }

        if(i <= j)
        {
            swap = items[i];
            items[i] = items[j];
            items[j] = swap;

            i++;
            j--;
        }
    }

    return i;
}


LifeUniverse.prototype.quick_sort = function(items, left, right)
{
    if(items.length <= 1)
    {
        return items;
    }

    var index = this.partition(items, left, right);

    if(left < index - 1)
    {
        this.quick_sort(items, left, index - 1);
    }

    if(index < right)
    {
        this.quick_sort(items, index, right);
    }

    return items;
}

LifeUniverse.prototype.setup_field_from_tree = function(node, level)
{
    if(level === 1)
    {
        return this.create_tree(
            node.nw ? this.true_leaf : this.false_leaf,
            node.ne ? this.true_leaf : this.false_leaf,
            node.sw ? this.true_leaf : this.false_leaf,
            node.se ? this.true_leaf : this.false_leaf
        );
    }
    else
    {
        level--;

        return this.create_tree(
            node.nw ? this.setup_field_from_tree(node.nw, level) : this.empty_tree(level),
            node.ne ? this.setup_field_from_tree(node.ne, level) : this.empty_tree(level),
            node.sw ? this.setup_field_from_tree(node.sw, level) : this.empty_tree(level),
            node.se ? this.setup_field_from_tree(node.se, level) : this.empty_tree(level)
        );
    }
}

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
}


/*LifeUniverse.prototype.get_field = function(node)
{
    var offset = this.pow2(node.level - 1),
        field = [];

    this.node_get_field(node, -offset, -offset, field);
    //node.get_field(-offset, -offset, field);
    
    return field;
}*/

LifeUniverse.prototype.set_step = function(step)
{
    if(step !== this.step)
    {
        this.step = step;

        if(this.generation > 0) {
            this.uncache(false);
        }
    }
};

LifeUniverse.prototype.set_rules = function(s, b)
{
    if(this.rule_s !== s || this.rule_b !== b)
    {
        this.rule_s = s;
        this.rule_b = b;

        if(this.generation > 0) {
            this.uncache(true);
        }
    }
};


/**
 * @constructor
 */
function TreeNode(nw, ne, sw, se, id)
{
    this.nw = nw;
    this.ne = ne;
    this.sw = sw;
    this.se = se;

    this.id = id;
    
    // 2^level = width of area
    this.level = nw.level + 1;

    this.population = nw.population + ne.population + sw.population + se.population;

    // one generation forward
    this.cache = null;

    // 2^(level - 2) generations forward
    this.quick_cache = null;

    /*if(this.population === 0)
    {
        this.cache = this.quick_cache = nw;
    }*/
}

LifeUniverse.prototype.node_set_bit = function(node, x, y, living)
{
    if(node.level === 0)
    {
        return living ? this.true_leaf : this.false_leaf;
    }

    var offset = this.pow2(node.level - 1) / 2,
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
        return true;
    }

    var offset = this.pow2(node.level - 1) / 2;
    
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

/*LifeUniverse.prototype.node_get_field = function(node, left, top, field)
{
    if(node.population === 0)
    {
        return;
    }

    var offset = this.pow2(node.level - 1);

    this.node_get_field(node.nw, left, top, field);
    this.node_get_field(node.sw, left + offset, top, field);
    this.node_get_field(node.ne, left, top + offset, field);
    this.node_get_field(node.se, left + offset, top + offset, field);
};*/

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

    return this.create_tree(
        this.eval_mask(bitmask >> 5), 
        this.eval_mask(bitmask >> 4), 
        this.eval_mask(bitmask >> 1), 
        this.eval_mask(bitmask)
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
    if(this.add_hash(node))
    {
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
    }
};

