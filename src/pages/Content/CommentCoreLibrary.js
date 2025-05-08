const __extends = (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();

/**
 * Binary Search Stubs for JS Arrays
 * @license MIT
 * @author Jim Chen
 */
export const BinArray = (function () {

    var BinArray = {};

    /**
     * Performs binary search on the array
     * Note: The array MUST ALREADY BE SORTED. Some cases will fail but we don't
     * guarantee that we can catch all cases.
     * 
     * @param arr - array to search on
     * @param what - element to search for (may not be present)
     * @param how - function comparator (a, b). Returns positive value if a > b
     * @return index of the element (or index of the element if it were in the array)
     **/
    BinArray.bsearch = function (arr, what, how) {
        if (!Array.isArray(arr)) {
            throw new Error('Bsearch can only be run on arrays');
        }
        if (arr.length === 0) {
            return 0;
        }
        if (how(what, arr[0]) < 0) {
            return 0;
        }
        if (how(what, arr[arr.length - 1]) >= 0) {
            return arr.length;
        }
        var low = 0;
        var i = 0;
        var count = 0;
        var high = arr.length - 1;
        while (low <= high) {
            i = Math.floor((high + low + 1) / 2);
            count++;
            if (how(what, arr[i - 1]) >= 0 && how(what, arr[i]) < 0) {
                return i;
            } else if (how(what, arr[i - 1]) < 0) {
                high = i - 1;
            } else if (how(what, arr[i]) >= 0) {
                low = i;
            } else {
                throw new Error('Program Error. Inconsistent comparator or unsorted array!');
            }
            if (count > 1500) {
                throw new Error('Iteration depth exceeded. Inconsistent comparator or astronomical dataset!');
            }
        }
        return -1;
    };

    /**
     * Insert an element into its position in the array signified by bsearch
     *
     * @param arr - array to insert into
     * @param what - element to insert
     * @param how - comparator (see bsearch)
     * @return index that the element was inserted to.
     **/
    BinArray.binsert = function (arr, what, how) {
        var index = BinArray.bsearch(arr, what, how);
        arr.splice(index, 0, what);
        return index;
    };

    return BinArray;
})();

/*!
 * Comment Core Library CommentManager
 * @license MIT
 * @author Jim Chen
 *
 * Copyright (c) 2014 Jim Chen
 */
export const CommentManager = (function () {
    var _defaultComparator = function (a, b) {
        if (a.stime > b.stime) {
            return 2;
        } else if (a.stime < b.stime) {
            return -2;
        } else {
            if (a.date > b.date) {
                return 1;
            } else if (a.date < b.date) {
                return -1;
            } else if (a.dbid != null && b.dbid != null) {
                if (a.dbid > b.dbid) {
                    return 1;
                } else if (a.dbid < b.dbid) {
                    return -1;
                }
                return 0;
            } else {
                return 0;
            }
        }
    };

    function CommentManagerInternal(stageObject) { // Renamed to avoid conflict with export
        var __timer = 0;

        this._listeners = {};
        this._lastPosition = 0;

        this.stage = stageObject;
        this.options = {
            global: {
                opacity: 1,
                scale: 1,
                className: "cmt"
            },
            scroll: {
                opacity: 1,
                scale: 1
            },
            limit: 0,
            seekTrigger: 2000
        };
        this.timeline = [];
        this.runline = [];
        this.position = 0;

        this.factory = null;
        this.filter = null;
        this.csa = {
            scroll: new CommentSpaceAllocator(0, 0),
            top: new AnchorCommentSpaceAllocator(0, 0),
            bottom: new AnchorCommentSpaceAllocator(0, 0),
            reverse: new CommentSpaceAllocator(0, 0),
            scrollbtm: new CommentSpaceAllocator(0, 0)
        };

        /** Precompute the offset width **/
        this.width = this.stage.offsetWidth;
        this.height = this.stage.offsetHeight;
        this._startTimer = function () {
            if (__timer > 0) {
                return;
            }
            var lastTPos = new Date().getTime();
            var cmMgr = this;
            __timer = window.setInterval(function () {
                var elapsed = new Date().getTime() - lastTPos;
                lastTPos = new Date().getTime();
                cmMgr.onTimerEvent(elapsed, cmMgr);
            }, 10);
        };
        this._stopTimer = function () {
            window.clearInterval(__timer);
            __timer = 0;
        };
    }

    /** Public **/
    CommentManagerInternal.prototype.stop = function () {
        this._stopTimer();
        // Send stop signal to all comments
        this.runline.forEach(function (c) { c.stop(); });
    };

    CommentManagerInternal.prototype.start = function () {
        this._startTimer();
    };

    CommentManagerInternal.prototype.pause = function () {
        // Alias for stop, as stop handles the pausing logic including stopping the timer
        // and calling stop on individual comments which should freeze CSS animations.
        this.stop();
    };

    CommentManagerInternal.prototype.seek = function (time) {
        this.position = BinArray.bsearch(this.timeline, time, function (a, b) {
            if (a < b.stime) {
                return -1
            } else if (a > b.stime) {
                return 1;
            } else {
                return 0;
            }
        });
    };

    CommentManagerInternal.prototype.validate = function (cmt) {
        if (cmt == null) {
            return false;
        }
        return this.filter.doValidate(cmt);
    };

    CommentManagerInternal.prototype.load = function (a) {
        this.timeline = a;
        this.timeline.sort(_defaultComparator);
        this.dispatchEvent("load");
    };

    CommentManagerInternal.prototype.insert = function (c) {
        var index = BinArray.binsert(this.timeline, c, _defaultComparator);
        if (index <= this.position) {
            this.position++;
        }
        this.dispatchEvent("insert");
    };

    CommentManagerInternal.prototype.clear = function () {
        while (this.runline.length > 0) {
            this.runline[0].finish();
        }
        this.dispatchEvent("clear");
    };

    CommentManagerInternal.prototype.setBounds = function () {
        this.width = this.stage.offsetWidth;
        this.height = this.stage.offsetHeight;
        this.dispatchEvent("resize");
        for (var comAlloc in this.csa) {
            this.csa[comAlloc].setBounds(this.width, this.height);
        }
        // Update 3d perspective
        this.stage.style.perspective = this.width / Math.tan(55 * Math.PI / 180) / 2 + "px";
        this.stage.style.webkitPerspective = this.width / Math.tan(55 * Math.PI / 180) / 2 + "px";
    };

    CommentManagerInternal.prototype.init = function (renderer) {
        this.setBounds();
        if (this.filter == null) {
            this.filter = new CommentFilter(); //Only create a filter if none exist
        }
        if (this.factory == null) {
            switch (renderer) {
                case 'legacy':
                    this.factory = CommentFactory.defaultFactory();
                    break;
                default:
                case 'css':
                    this.factory = CommentFactory.defaultCssRenderFactory();
                    break;
            }
        }
    };

    CommentManagerInternal.prototype.time = function (time) {
        if (this.position >= this.timeline.length ||
            Math.abs(this._lastPosition - time) >= this.options.seekTrigger) {

            this.seek(time);
            this._lastPosition = time;
            if (this.timeline.length <= this.position) {
                return;
            }
        } else {
            this._lastPosition = time;
        }
        var batch = [];
        for (; this.position < this.timeline.length; this.position++) {
            if (this.timeline[this.position]['stime'] <= time) {
                if (this.options.limit > 0 &&
                    this.runline.length + batch.length >= this.options.limit) {

                    continue; // Skip comments but still move the position pointer
                } else if (this.validate(this.timeline[this.position])) {
                    batch.push(this.timeline[this.position]);
                }
            } else {
                break;
            }
        }
        if (batch.length > 0) {
            this.send(batch);
        }
    };

    CommentManagerInternal.prototype.rescale = function () {
        // TODO: Implement rescaling
    };

    CommentManagerInternal.prototype._preprocess = function (data) {
        if (data.mode === 8) {
            // This comment is not managed by the comment manager
            console.log(data);
            if (this.scripting) {
                console.log(this.scripting.eval(data.code));
            }
            return null;
        }
        if (this.filter != null) {
            data = this.filter.doModify(data);
        }
        return data;
    }

    CommentManagerInternal.prototype._allocateSpace = function (cmt) {
        switch (cmt.mode) {
            default:
            case 1: { this.csa.scroll.add(cmt); } break;
            case 2: { this.csa.scrollbtm.add(cmt); } break;
            case 4: { this.csa.bottom.add(cmt); } break;
            case 5: { this.csa.top.add(cmt); } break;
            case 6: { this.csa.reverse.add(cmt); } break;
            case 7:
            case 17: {/* Do NOT manage these comments! */ } break;
        }
    }

    CommentManagerInternal.prototype.send = function (data) {
        if (!Array.isArray(data)) {
            data = [data];
        }
        // Validate all the comments
        data = data.map(
            this._preprocess.bind(this)).filter(function (item) {
                return item !== null;
            });
        if (data.length === 0) {
            return;
        }
        data.map((function (item) {
            // Create and insert the comments into the DOM
            return this.factory.create(this, item);
        }).bind(this)).map((function (cmt) {
            this._allocateSpace(cmt);
            return cmt;
        }).bind(this)).forEach((function (cmt) {
            cmt.y = cmt.y;
            this.dispatchEvent("enterComment", cmt);
            this.runline.push(cmt);
        }).bind(this));
    };

    CommentManagerInternal.prototype.finish = function (cmt) {
        this.dispatchEvent("exitComment", cmt);
        this.stage.removeChild(cmt.dom);
        var index = this.runline.indexOf(cmt);
        if (index >= 0) {
            this.runline.splice(index, 1);
        }
        switch (cmt.mode) {
            default:
            case 1: { this.csa.scroll.remove(cmt); } break;
            case 2: { this.csa.scrollbtm.remove(cmt); } break;
            case 4: { this.csa.bottom.remove(cmt); } break;
            case 5: { this.csa.top.remove(cmt); } break;
            case 6: { this.csa.reverse.remove(cmt); } break;
            case 7: break;
        }
    };

    CommentManagerInternal.prototype.addEventListener = function (event, listener) {
        if (typeof this._listeners[event] !== "undefined") {
            this._listeners[event].push(listener);
        } else {
            this._listeners[event] = [listener];
        }
    };

    CommentManagerInternal.prototype.dispatchEvent = function (event, data) {
        if (typeof this._listeners[event] !== "undefined") {
            for (var i = 0; i < this._listeners[event].length; i++) {
                try {
                    this._listeners[event][i](data);
                } catch (e) {
                    console.error(e.stack);
                }
            }
        }
    };

    /** Static Functions **/
    CommentManagerInternal.prototype.onTimerEvent = function (timePassed, cmObj) {
        for (var i = 0; i < cmObj.runline.length; i++) {
            var cmt = cmObj.runline[i];
            cmt.time(timePassed);
        }
    };

    return CommentManagerInternal;
})();

export const CoreComment = (function () {
    function CoreComment(parent, init) {
        if (init === void 0) { init = {}; }
        this.mode = 1;
        this.stime = 0;
        this.text = '';
        this.ttl = 4000;
        this.dur = 4000;
        this.cindex = -1;
        this.motion = [];
        this.movable = true;
        this._alphaMotion = null;
        this.absolute = true;
        this.align = 0;
        this.axis = 0;
        this._alpha = 1;
        this._size = 25;
        this._color = 0xffffff;
        this._border = false;
        this._shadow = true;
        this._font = '';
        this._transform = null;
        if (!parent) {
            throw new Error('Comment not bound to comment manager.');
        }
        else {
            this.parent = parent;
        }
        if (init.hasOwnProperty('stime')) {
            this.stime = init['stime'];
        }
        if (init.hasOwnProperty('mode')) {
            this.mode = init['mode'];
        }
        else {
            this.mode = 1;
        }
        if (init.hasOwnProperty('dur')) {
            this.dur = init['dur'];
            this.ttl = this.dur;
        }
        this.dur *= this.parent.options.global.scale;
        this.ttl *= this.parent.options.global.scale;
        if (init.hasOwnProperty('text')) {
            this.text = init['text'];
        }
        if (init.hasOwnProperty('motion')) {
            this._motionStart = [];
            this._motionEnd = [];
            this.motion = init['motion'];
            var head = 0;
            for (var i = 0; i < init['motion'].length; i++) {
                this._motionStart.push(head);
                var maxDur = 0;
                for (var k in init['motion'][i]) {
                    var m = init['motion'][i][k];
                    maxDur = Math.max(m.dur + m.delay, maxDur);
                    if (m.easing === null || m.easing === undefined) {
                        init['motion'][i][k]['easing'] = CoreComment.LINEAR;
                    }
                }
                head += maxDur;
                this._motionEnd.push(head);
            }
            this._curMotion = 0;
        }
        if (init.hasOwnProperty('color')) {
            this._color = init['color'];
        }
        if (init.hasOwnProperty('size')) {
            this._size = init['size'];
        }
        if (init.hasOwnProperty('border')) {
            this._border = init['border'];
        }
        if (init.hasOwnProperty('opacity')) {
            this._alpha = init['opacity'];
        }
        if (init.hasOwnProperty('alpha')) {
            this._alphaMotion = init['alpha'];
        }
        if (init.hasOwnProperty('font')) {
            this._font = init['font'];
        }
        if (init.hasOwnProperty('x')) {
            this._x = init['x'];
        }
        if (init.hasOwnProperty('y')) {
            this._y = init['y'];
        }
        if (init.hasOwnProperty('shadow')) {
            this._shadow = init['shadow'];
        }
        if (init.hasOwnProperty('align')) {
            this.align = init['align'];
        }
        if (init.hasOwnProperty('axis')) {
            this.axis = init['axis'];
        }
        if (init.hasOwnProperty('transform')) {
            this._transform = new CommentUtils.Matrix3D(init['transform']);
        }
        if (init.hasOwnProperty('position')) {
            if (init['position'] === 'relative') {
                this.absolute = false;
                if (this.mode < 7) {
                    console.warn('Using relative position for CSA comment.');
                }
            }
        }
    }
    CoreComment.prototype._toggleClass = function (className, toggle) {
        if (toggle === void 0) { toggle = false; }
        if (!this.dom) {
            return;
        }
        if (this.dom.classList) {
            this.dom.classList.toggle(className, toggle);
        }
        else {
            var classList = this.dom.className.split(' ');
            var index = classList.indexOf(className);
            if (index >= 0 && !toggle) {
                classList.splice(index, 1);
                this.dom.className = classList.join(' ');
            }
            else if (index < 0 && toggle) {
                classList.push(className);
                this.dom.className = classList.join(' ');
            }
        }
    };
    CoreComment.prototype.init = function (recycle) {
        if (recycle === void 0) { recycle = null; }
        if (recycle !== null) {
            this.dom = recycle.dom;
        }
        else {
            this.dom = document.createElement('div');
        }
        this.dom.className = this.parent.options.global.className;
        this.dom.appendChild(document.createTextNode(this.text));
        this.dom.textContent = this.text;
        this.dom.innerText = this.text;
        this.size = this._size;
        if (this._color != 0xffffff) {
            this.color = this._color;
        }
        this.shadow = this._shadow;
        if (this._border) {
            this.border = this._border;
        }
        if (this._font !== '') {
            this.font = this._font;
        }
        if (this._x !== undefined) {
            this.x = this._x;
        }
        if (this._y !== undefined) {
            this.y = this._y;
        }
        if (this._alpha !== 1 || this.parent.options.global.opacity < 1) {
            this.alpha = this._alpha;
        }
        if (this._transform !== null && !this._transform.isIdentity()) {
            this.transform = this._transform.flatArray;
        }
        if (this.motion.length > 0) {
            this.animate();
        }
    };
    Object.defineProperty(CoreComment.prototype, "x", {
        get: function () {
            if (this._x === null || this._x === undefined) {
                if (this.axis % 2 === 0) {
                    if (this.align % 2 === 0) {
                        this._x = this.dom.offsetLeft;
                    }
                    else {
                        this._x = this.dom.offsetLeft + this.width;
                    }
                }
                else {
                    if (this.align % 2 === 0) {
                        this._x = this.parent.width - this.dom.offsetLeft;
                    }
                    else {
                        this._x = this.parent.width - this.dom.offsetLeft - this.width;
                    }
                }
            }
            if (!this.absolute) {
                return this._x / this.parent.width;
            }
            return this._x;
        },
        set: function (x) {
            this._x = x;
            if (!this.absolute) {
                this._x *= this.parent.width;
            }
            if (this.axis % 2 === 0) {
                this.dom.style.left = (this._x + (this.align % 2 === 0 ? 0 : -this.width)) + 'px';
            }
            else {
                this.dom.style.right = (this._x + (this.align % 2 === 0 ? -this.width : 0)) + 'px';
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "y", {
        get: function () {
            if (this._y === null || this._y === undefined) {
                if (this.axis < 2) {
                    if (this.align < 2) {
                        this._y = this.dom.offsetTop;
                    }
                    else {
                        this._y = this.dom.offsetTop + this.height;
                    }
                }
                else {
                    if (this.align < 2) {
                        this._y = this.parent.height - this.dom.offsetTop;
                    }
                    else {
                        this._y = this.parent.height - this.dom.offsetTop - this.height;
                    }
                }
            }
            if (!this.absolute) {
                return this._y / this.parent.height;
            }
            return this._y;
        },
        set: function (y) {
            this._y = y;
            if (!this.absolute) {
                this._y *= this.parent.height;
            }
            if (this.axis < 2) {
                this.dom.style.top = (this._y + (this.align < 2 ? 0 : -this.height)) + 'px';
            }
            else {
                this.dom.style.bottom = (this._y + (this.align < 2 ? -this.height : 0)) + 'px';
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "bottom", {
        get: function () {
            var sameDirection = Math.floor(this.axis / 2) === Math.floor(this.align / 2);
            return this.y + (sameDirection ? this.height : 0);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "right", {
        get: function () {
            var sameDirection = this.axis % 2 === this.align % 2;
            return this.x + (sameDirection ? this.width : 0);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "width", {
        get: function () {
            if (this._width === null || this._width === undefined) {
                this._width = this.dom.offsetWidth;
            }
            return this._width;
        },
        set: function (w) {
            this._width = w;
            this.dom.style.width = this._width + 'px';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "height", {
        get: function () {
            if (this._height === null || this._height === undefined) {
                this._height = this.dom.offsetHeight;
            }
            return this._height;
        },
        set: function (h) {
            this._height = h;
            this.dom.style.height = this._height + 'px';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "size", {
        get: function () {
            return this._size;
        },
        set: function (s) {
            this._size = s;
            this.dom.style.fontSize = this._size + 'px';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "color", {
        get: function () {
            return this._color;
        },
        set: function (c) {
            this._color = c;
            var color = c.toString(16);
            color = color.length >= 6 ? color : new Array(6 - color.length + 1).join('0') + color;
            this.dom.style.color = '#' + color;
            if (this._color === 0) {
                this._toggleClass('reverse-shadow', true);
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "alpha", {
        get: function () {
            return this._alpha;
        },
        set: function (a) {
            this._alpha = a;
            this.dom.style.opacity = Math.min(this._alpha, this.parent.options.global.opacity) + '';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "border", {
        get: function () {
            return this._border;
        },
        set: function (b) {
            this._border = b;
            if (this._border) {
                this.dom.style.border = '1px solid #00ffff';
            }
            else {
                this.dom.style.border = 'none';
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "shadow", {
        get: function () {
            return this._shadow;
        },
        set: function (s) {
            this._shadow = s;
            if (!this._shadow) {
                this._toggleClass('no-shadow', true);
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "font", {
        get: function () {
            return this._font;
        },
        set: function (f) {
            this._font = f;
            if (this._font.length > 0) {
                this.dom.style.fontFamily = this._font;
            }
            else {
                this.dom.style.fontFamily = '';
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CoreComment.prototype, "transform", {
        get: function () {
            return this._transform.flatArray;
        },
        set: function (array) {
            this._transform = new CommentUtils.Matrix3D(array);
            if (this.dom !== null) {
                this.dom.style.transform = this._transform.toCss();
            }
        },
        enumerable: true,
        configurable: true
    });
    CoreComment.prototype.time = function (time) {
        this.ttl -= time;
        if (this.ttl < 0) {
            this.ttl = 0;
        }
        if (this.movable) {
            this.update();
        }
        if (this.ttl <= 0) {
            this.finish();
        }
    };
    CoreComment.prototype.update = function () {
        this.animate();
    };
    CoreComment.prototype.invalidate = function () {
        this._x = null;
        this._y = null;
        this._width = null;
        this._height = null;
    };
    CoreComment.prototype._execMotion = function (currentMotion, time) {
        for (var prop in currentMotion) {
            if (currentMotion.hasOwnProperty(prop)) {
                var m = currentMotion[prop];
                this[prop] = m.easing(Math.min(Math.max(time - m.delay, 0), m.dur), m.from, m.to - m.from, m.dur);
            }
        }
    };
    CoreComment.prototype.animate = function () {
        if (this._alphaMotion) {
            this.alpha =
                (this.dur - this.ttl) *
                (this._alphaMotion['to'] - this._alphaMotion['from']) /
                this.dur +
                this._alphaMotion['from'];
        }
        if (this.motion.length === 0) {
            return;
        }
        var ttl = Math.max(this.ttl, 0);
        var time = (this.dur - ttl) - this._motionStart[this._curMotion];
        this._execMotion(this.motion[this._curMotion], time);
        if (this.dur - ttl > this._motionEnd[this._curMotion]) {
            this._curMotion++;
            if (this._curMotion >= this.motion.length) {
                this._curMotion = this.motion.length - 1;
            }
            return;
        }
    };
    CoreComment.prototype.stop = function () {
    };
    CoreComment.prototype.finish = function () {
        this.parent.finish(this);
    };
    CoreComment.prototype.toString = function () {
        return ['[', this.stime, '|', this.ttl, '/', this.dur, ']', '(', this.mode, ')', this.text].join('');
    };
    CoreComment.LINEAR = function (t, b, c, d) {
        return t * c / d + b;
    };
    return CoreComment;
}());

export const ScrollComment = (function (_super) {
    __extends(ScrollComment, _super);
    function ScrollComment(parent, data) {
        var _this = _super.call(this, parent, data) || this;
        _this.dur *= _this.parent.options.scroll.scale;
        _this.ttl *= _this.parent.options.scroll.scale;
        return _this;
    }
    Object.defineProperty(ScrollComment.prototype, "alpha", {
        set: function (a) {
            this._alpha = a;
            this.dom.style.opacity = Math.min(Math.min(this._alpha, this.parent.options.global.opacity), this.parent.options.scroll.opacity) + '';
        },
        enumerable: true,
        configurable: true,
        get: function () { return this._alpha; } // Added getter for consistency
    });
    ScrollComment.prototype.init = function (recycle) {
        if (recycle === void 0) { recycle = null; }
        _super.prototype.init.call(this, recycle);
        this.x = this.parent.width;
        if (this.parent.options.scroll.opacity < 1) {
            this.alpha = this._alpha;
        }
        this.absolute = true;
    };
    ScrollComment.prototype.update = function () {
        this.x = (this.ttl / this.dur) * (this.parent.width + this.width) - this.width;
    };
    return ScrollComment;
}(CoreComment));

export const CommentFactory = (function () {
    function CommentFactory() {
        this._bindings = {};
    }
    CommentFactory._simpleCssScrollingInitializer = function (manager, data) {
        var cmt = new CssScrollComment(manager, data);
        switch (cmt.mode) {
            case 1: {
                cmt.align = 0;
                cmt.axis = 0;
                break;
            }
            case 2: {
                cmt.align = 2;
                cmt.axis = 2;
                break;
            }
            case 6: {
                cmt.align = 1;
                cmt.axis = 1;
                break;
            }
        }
        cmt.init();
        manager.stage.appendChild(cmt.dom);
        return cmt;
    };
    CommentFactory._simpleScrollingInitializer = function (manager, data) {
        var cmt = new ScrollComment(manager, data);
        switch (cmt.mode) {
            case 1: {
                cmt.align = 0;
                cmt.axis = 0;
                break;
            }
            case 2: {
                cmt.align = 2;
                cmt.axis = 2;
                break;
            }
            case 6: {
                cmt.align = 1;
                cmt.axis = 1;
                break;
            }
        }
        cmt.init();
        manager.stage.appendChild(cmt.dom);
        return cmt;
    };
    CommentFactory._simpleAnchoredInitializer = function (manager, data) {
        var cmt = new CoreComment(manager, data);
        switch (cmt.mode) {
            case 4: {
                cmt.align = 2;
                cmt.axis = 2;
                break;
            }
            case 5: {
                cmt.align = 0;
                cmt.axis = 0;
                break;
            }
        }
        cmt.init();
        manager.stage.appendChild(cmt.dom);
        return cmt;
    };
    ;
    CommentFactory._advancedCoreInitializer = function (manager, data) {
        var cmt = new CoreComment(manager, data);
        cmt.init();
        cmt.transform = CommentUtils.Matrix3D.createRotationMatrix(0, data['rY'], data['rZ']).flatArray;
        manager.stage.appendChild(cmt.dom);
        return cmt;
    };
    CommentFactory.defaultFactory = function () {
        var factory = new CommentFactory();
        factory.bind(1, CommentFactory._simpleScrollingInitializer);
        factory.bind(2, CommentFactory._simpleScrollingInitializer);
        factory.bind(6, CommentFactory._simpleScrollingInitializer);
        factory.bind(4, CommentFactory._simpleAnchoredInitializer);
        factory.bind(5, CommentFactory._simpleAnchoredInitializer);
        factory.bind(7, CommentFactory._advancedCoreInitializer);
        factory.bind(17, CommentFactory._advancedCoreInitializer);
        return factory;
    };
    CommentFactory.defaultCssRenderFactory = function () {
        var factory = new CommentFactory();
        factory.bind(1, CommentFactory._simpleCssScrollingInitializer);
        factory.bind(2, CommentFactory._simpleCssScrollingInitializer);
        factory.bind(6, CommentFactory._simpleCssScrollingInitializer);
        factory.bind(4, CommentFactory._simpleAnchoredInitializer);
        factory.bind(5, CommentFactory._simpleAnchoredInitializer);
        factory.bind(7, CommentFactory._advancedCoreInitializer);
        factory.bind(17, CommentFactory._advancedCoreInitializer);
        return factory;
    };
    CommentFactory.defaultCanvasRenderFactory = function () {
        throw new Error('Not implemented');
    };
    CommentFactory.defaultSvgRenderFactory = function () {
        throw new Error('Not implemented');
    };
    CommentFactory.prototype.bind = function (mode, factory) {
        this._bindings[mode] = factory;
    };
    CommentFactory.prototype.canCreate = function (comment) {
        return this._bindings.hasOwnProperty(comment['mode']);
    };
    CommentFactory.prototype.create = function (manager, comment) {
        if (comment === null || !comment.hasOwnProperty('mode')) {
            throw new Error('Comment format incorrect');
        }
        if (!this._bindings.hasOwnProperty(comment['mode'])) {
            throw new Error('No binding for comment type ' + comment['mode']);
        }
        return this._bindings[comment['mode']](manager, comment);
    };
    return CommentFactory;
}());

export const CommentSpaceAllocator = (function () {
    function CommentSpaceAllocator(width, height) {
        if (width === void 0) { width = 0; }
        if (height === void 0) { height = 0; }
        this._pools = [
            []
        ];
        this.avoid = 3; // Increased from 1 to 3 for better vertical spacing
        this._width = width;
        this._height = height;
    }
    CommentSpaceAllocator.prototype.willCollide = function (existing, check) {
        // Revised collision logic: checks if lifespans overlap
        return Math.max(existing.stime, check.stime) < Math.min(existing.stime + existing.ttl, check.stime + check.ttl);
    };
    CommentSpaceAllocator.prototype.pathCheck = function (y, comment, pool) {
        var bottom = y + comment.height;
        var right = comment.right;
        for (var i = 0; i < pool.length; i++) {
            if (pool[i].y > bottom || pool[i].bottom < y) {
                continue;
            }
            else if (pool[i].right < comment.x || pool[i].x > right) {
                if (this.willCollide(pool[i], comment)) {
                    return false;
                }
                else {
                    continue;
                }
            }
            else {
                return false;
            }
        }
        return true;
    };
    CommentSpaceAllocator.prototype.assign = function (comment, cindex) {
        while (this._pools.length <= cindex) {
            this._pools.push([]);
        }
        var pool = this._pools[cindex];
        if (pool.length === 0) {
            comment.cindex = cindex;
            return 0;
        }
        else if (this.pathCheck(0, comment, pool)) {
            comment.cindex = cindex;
            return 0;
        }
        var y = 0;
        for (var k = 0; k < pool.length; k++) {
            y = pool[k].bottom + this.avoid;
            if (y + comment.height > this._height) {
                break;
            }
            if (this.pathCheck(y, comment, pool)) {
                comment.cindex = cindex;
                return y;
            }
        }
        return this.assign(comment, cindex + 1);
    };
    CommentSpaceAllocator.prototype.add = function (comment) {
        if (comment.height > this._height) {
            comment.cindex = -2;
            comment.y = 0;
        }
        else {
            comment.y = this.assign(comment, 0);
            BinArray.binsert(this._pools[comment.cindex], comment, function (a, b) {
                if (a.bottom < b.bottom) {
                    return -1;
                }
                else if (a.bottom > b.bottom) {
                    return 1;
                }
                else {
                    return 0;
                }
            });
        }
    };
    CommentSpaceAllocator.prototype.remove = function (comment) {
        if (comment.cindex < 0) {
            return;
        }
        if (comment.cindex >= this._pools.length) {
            throw new Error('cindex out of bounds');
        }
        var index = this._pools[comment.cindex].indexOf(comment);
        if (index < 0)
            return;
        this._pools[comment.cindex].splice(index, 1);
    };
    CommentSpaceAllocator.prototype.setBounds = function (width, height) {
        this._width = width;
        this._height = height;
    };
    return CommentSpaceAllocator;
}());

export const AnchorCommentSpaceAllocator = (function (_super) {
    __extends(AnchorCommentSpaceAllocator, _super);
    function AnchorCommentSpaceAllocator() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    AnchorCommentSpaceAllocator.prototype.add = function (comment) {
        _super.prototype.add.call(this, comment);
        comment.x = (this._width - comment.width) / 2;
    };
    AnchorCommentSpaceAllocator.prototype.willCollide = function (a, b) {
        return true;
    };
    AnchorCommentSpaceAllocator.prototype.pathCheck = function (y, comment, pool) {
        var bottom = y + comment.height;
        for (var i = 0; i < pool.length; i++) {
            if (pool[i].y > bottom || pool[i].bottom < y) {
                continue;
            }
            else {
                return false;
            }
        }
        return true;
    };
    return AnchorCommentSpaceAllocator;
}(CommentSpaceAllocator));

export const CommentUtils = {};
(function (CU) {
    const Matrix3D = (function () {
        function Matrix3DInternal(array) {
            this._internalArray = null;
            if (!Array.isArray(array)) {
                throw new Error('Not an array. Cannot construct matrix.');
            }
            if (array.length != 16) {
                throw new Error('Illegal Dimensions. Matrix3D should be 4x4 matrix.');
            }
            this._internalArray = array;
        }
        Object.defineProperty(Matrix3DInternal.prototype, "flatArray", {
            get: function () {
                return this._internalArray.slice(0);
            },
            set: function (_array) { // Parameter name changed to avoid lint error
                throw new Error('Not permitted. Matrices are immutable.');
            },
            enumerable: true,
            configurable: true
        });
        Matrix3DInternal.prototype.isIdentity = function () {
            return this.equals(Matrix3DInternal.identity());
        };
        Matrix3DInternal.prototype.dot = function (matrix) {
            var a = this._internalArray.slice(0);
            var b = matrix._internalArray.slice(0);
            var res = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (var i = 0; i < 4; i++) {
                for (var j = 0; j < 4; j++) {
                    for (var k = 0; k < 4; k++) {
                        res[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
                    }
                }
            }
            return new Matrix3DInternal(res);
        };
        Matrix3DInternal.prototype.equals = function (matrix) {
            for (var i = 0; i < 16; i++) {
                if (this._internalArray[i] !== matrix._internalArray[i]) {
                    return false;
                }
            }
            return true;
        };
        Matrix3DInternal.prototype.toCss = function () {
            var matrix = this._internalArray.slice(0);
            for (var i = 0; i < matrix.length; i++) {
                if (Math.abs(matrix[i]) < 0.000001) {
                    matrix[i] = 0;
                }
            }
            return 'matrix3d(' + matrix.join(',') + ')';
        };
        Matrix3DInternal.identity = function () {
            return new Matrix3DInternal([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        };
        Matrix3DInternal.createScaleMatrix = function (xscale, yscale, zscale) {
            return new Matrix3DInternal([xscale, 0, 0, 0, 0, yscale, 0, 0, 0, 0, zscale, 0, 0, 0, 0, 1]);
        };
        Matrix3DInternal.createRotationMatrix = function (xrot, yrot, zrot) {
            var DEG2RAD = Math.PI / 180;
            var yr = yrot * DEG2RAD;
            var zr = zrot * DEG2RAD;
            var COS = Math.cos;
            var SIN = Math.sin;
            var matrix = [
                COS(yr) * COS(zr), COS(yr) * SIN(zr), SIN(yr), 0,
                (-SIN(zr)), COS(zr), 0, 0,
                (-SIN(yr) * COS(zr)), (-SIN(yr) * SIN(zr)), COS(yr), 0,
                0, 0, 0, 1
            ];
            return new Matrix3DInternal(matrix.map(function (v) { return Math.round(v * 1e10) * 1e-10; }));
        };
        return Matrix3DInternal;
    }());
    CU.Matrix3D = Matrix3D;
})(CommentUtils);


export const CssCompatLayer = (function () {
    function CssCompatLayer() {
    }
    CssCompatLayer.transform = function (dom, trans) {
        dom.style.transform = trans;
        dom.style["webkitTransform"] = trans;
        dom.style["msTransform"] = trans;
        dom.style["oTransform"] = trans;
    };
    return CssCompatLayer;
}());

export const CssScrollComment = (function (_super) {
    __extends(CssScrollComment, _super);
    function CssScrollComment() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this._dirtyCSS = true;
        return _this;
    }
    CssScrollComment.prototype.init = function (recycle) {
        if (recycle === void 0) { recycle = null; }
        _super.prototype.init.call(this, recycle); // Calls ScrollComment.init which sets this.x = parent.width
        // CoreComment.init then calls this.x setter.

        // Initial position for CSS transitions: directly set transform to start off-screen right.
        // this.x (getter) will return the value set by ScrollComment.init via CoreComment's x setter call.
        CssCompatLayer.transform(this.dom, "translateX(" + this.x + "px)");

        this._toggleClass('css-optimize', true);
        this._dirtyCSS = true; // Ensure update sets up the first transition
    };

    Object.defineProperty(CssScrollComment.prototype, "x", {
        get: function () {
            return this._x; // Simply return the logical _x position
        },
        set: function (newX) {
            // This setter should update the logical position and mark for CSS update if needed.
            // It should NOT directly apply transforms if a CSS transition is managing movement.
            if (this._x !== newX) {
                this._x = newX;
                // If the logical position is changed (e.g. by a seek or direct manipulation),
                // the CSS transition needs to be re-evaluated.
                this._dirtyCSS = true;
            }
        },
        enumerable: true,
        configurable: true
    });

    CssScrollComment.prototype.update = function () {
        // This is called by CoreComment.time() -> this.update() if movable
        // We set up the CSS transition once when _dirtyCSS is true.
        if (this._dirtyCSS && this.ttl > 0) {
            // Use current ttl for the remaining duration of the transition
            this.dom.style.transition = "transform " + this.ttl + "ms linear";
            // Target transform: move to off-screen left
            var targetX = (this.axis % 2 === 0 ? -this.width : this.parent.width + this.width); // Adjusted for bi-directional scroll
            if (this.axis % 2 !== 0) { // Reverse scroll (mode 6), target is parent.width (effectively starts at -this.width)
                // For reverse, initial X should be -this.width, target is parent.width.
                // CssCompatLayer.transform(this.dom, "translateX(" + targetX + "px)"); 
                // My init sets this.x from parent.width. For mode 6, init should be -this.width.
                // This part needs mode-specific handling in init for starting pos.
                // For now, assuming mode 1 (axis 0)
                CssCompatLayer.transform(this.dom, "translateX(" + (-this.width) + "px)");
            } else {
                CssCompatLayer.transform(this.dom, "translateX(" + (-this.width) + "px)");
            }
            this._dirtyCSS = false;
        }
        // If !this._dirtyCSS, CSS handles the animation. CoreComment.time() updates ttl.
        // If ttl reaches 0, finish() is called.
    };

    CssScrollComment.prototype.stop = function () {
        _super.prototype.stop.call(this);
        if (!this.dom) return;

        var computedStyle = window.getComputedStyle(this.dom);
        var currentTransform = computedStyle.transform;

        this.dom.style.transition = 'none'; // Stop CSS transition
        CssCompatLayer.transform(this.dom, currentTransform); // Apply current visual position statically

        // Update logical _x based on the frozen position
        if (currentTransform && currentTransform !== 'none') {
            var matrix = new DOMMatrix(currentTransform); // Modern way, or use regex for older matrix string
            this._x = matrix.e; // For 2D matrix(a,b,c,d,e,f), e is translateX
            if (this.axis % 2 !== 0) { // For reverse, logical _x might need to be adjusted from transform
                // this._x = this.parent.width - matrix.e -this.width ? // complex logic needed if this.x means start
            }
        }

        this._dirtyCSS = true; // Ready for a new transition if started again
    };
    return CssScrollComment;
}(ScrollComment));


/**
 * Comment Filters Module Simplified
 * @license MIT
 * @author Jim Chen
 */
export const CommentFilter = (function () {

    /**
     * Matches a rule against an input that could be the full or a subset of
     * the comment data.
     *
     * @param rule - rule object to match
     * @param cmtData - full or portion of comment data
     * @return boolean indicator of match
     */
    function _match(rule, cmtData) {
        var path = rule.subject.split('.');
        var extracted = cmtData;
        while (path.length > 0) {
            var item = path.shift();
            if (item === '') {
                continue;
            }
            if (extracted.hasOwnProperty(item)) {
                extracted = extracted[item];
            }
            if (extracted === null || typeof extracted === 'undefined') {
                extracted = null;
                break;
            }
        }
        if (extracted === null) {
            // Null precondition implies anything
            return true;
        }
        switch (rule.op) {
            case '<':
                return extracted < rule.value;
            case '>':
                return extracted > rule.value;
            case '~':
            case 'regexp':
                return (new RegExp(rule.value)).test(extracted.toString());
            case '=':
            case 'eq':
                return rule.value ===
                    ((typeof extracted === 'number') ?
                        extracted : extracted.toString());
            case '!':
            case 'not':
                return !_match(rule.value, extracted); // Extracted was passed to _match, should be cmtData for recursive call?
            // Assuming rule.value is a sub-rule object for 'not'.
            // If rule.value is the value to not match against extracted, then it's different.
            // Original seems to imply rule.value is a sub-rule.
            case '&&':
            case 'and':
                if (Array.isArray(rule.value)) {
                    return rule.value.every(function (r) {
                        return _match(r, cmtData); // Pass cmtData, not extracted for each sub-rule
                    });
                } else {
                    return false;
                }
            case '||':
            case 'or':
                if (Array.isArray(rule.value)) {
                    return rule.value.some(function (r) {
                        return _match(r, cmtData); // Pass cmtData here too
                    });
                } else {
                    return false;
                }
            default:
                return false;
        }
    }

    /**
     * Constructor for CommentFilter
     * @constructor
     */
    function CommentFilterInternal() { // Renamed
        this.rules = [];
        this.modifiers = [];
        this.allowUnknownTypes = true;
        this.allowTypes = {
            '1': true,
            '2': true,
            '4': true,
            '5': true,
            '6': true,
            '7': true,
            '8': true,
            '17': true
        };
    }

    /**
     * Runs all modifiers against current comment
     *
     * @param cmt - comment to run modifiers on
     * @return modified comment
     */
    CommentFilterInternal.prototype.doModify = function (cmt) {
        return this.modifiers.reduce(function (c, f) {
            return f(c);
        }, cmt);
    };

    /**
     * Executes a method defined to be executed right before the comment object
     * (built from commentData) is placed onto the runline.
     *
     * @deprecated
     * @param cmt - comment data
     * @return cmt
     */
    CommentFilterInternal.prototype.beforeSend = function (cmt) {
        return cmt;
    };

    /**
     * Performs validation of the comment data before it is allowed to get sent
     * by applying type constraints and rules
     *
     * @param cmtData - comment data
     * @return boolean indicator of whether this commentData should be shown
     */
    CommentFilterInternal.prototype.doValidate = function (cmtData) {
        if (!cmtData.hasOwnProperty('mode')) {
            return false;
        }
        if ((!this.allowUnknownTypes ||
            cmtData.mode.toString() in this.allowTypes) && // This seems a bit off, if allowUnknownTypes is false, and mode is in allowTypes, it should use allowTypes[mode]
            // Corrected logic: if type is not allowed (and not unknown OR unknown is not allowed)
            !this.allowTypes[cmtData.mode.toString()] && !(this.allowUnknownTypes && !(cmtData.mode.toString() in this.allowTypes))) {
            // Simpler: if mode is not in allowTypes AND (allowUnknownTypes is false OR it is in allowTypes already implying it's known)
            // if (!this.allowTypes[cmtData.mode.toString()] && (!this.allowUnknownTypes || (cmtData.mode.toString() in this.allowTypes))) return false;
            // Original seems: If it's a known type (in allowTypes) but set to false, block.
            // If it's an unknown type (not in allowTypes) AND allowUnknownTypes is false, block.
            if (this.allowTypes.hasOwnProperty(cmtData.mode.toString())) {
                if (!this.allowTypes[cmtData.mode.toString()]) return false;
            } else { // Unknown type
                if (!this.allowUnknownTypes) return false;
            }
        }
        return this.rules.every(function (rule) {
            // Decide if matched
            var matched = false; // Initialize matched
            try {
                matched = _match(rule, cmtData);
            } catch (e) {
                // matched remains false
                console.error("Error matching rule:", e);
            }
            return rule.mode === 'accept' ? matched : !matched;
        });
    };

    /**
     * Adds a rule for use with validation
     *
     * @param rule - object containing rule definitions
     * @throws Exception when rule mode is incorrect
     */
    CommentFilterInternal.prototype.addRule = function (rule) {
        if (rule.mode !== 'accept' && rule.mode !== 'reject') {
            throw new Error('Rule must be of accept type or reject type.');
        }
        this.rules.push(rule);
    };

    /**
     * Removes a rule
     *
     * @param rule - the rule that was added
     * @return true if the rule was removed, false if not found
     */
    CommentFilterInternal.prototype.removeRule = function (rule) {
        var index = this.rules.indexOf(rule);
        if (index >= 0) {
            this.rules.splice(index, 1);
            return true;
        } else {
            return false;
        }
    };

    /**
     * Adds a modifier to be used
     *
     * @param modifier - modifier function that takes in comment data and
     *                   returns modified comment data
     * @throws Exception when modifier is not a function
     */
    CommentFilterInternal.prototype.addModifier = function (f) {
        if (typeof f !== 'function') {
            throw new Error('Modifiers need to be functions.');
        }
        this.modifiers.push(f);
    };

    return CommentFilterInternal;
})();

/**
 * Comment Provider
 * Provides functionality to send or receive danmaku
 * @license MIT
 * @author Jim Chen
**/

export const CommentProvider = (function () {

    function CommentProviderInternal() { // Renamed
        this._started = false;
        this._destroyed = false;
        this._staticSources = {};
        this._dynamicSources = {};
        this._parsers = {}
        this._targets = [];
    }

    CommentProviderInternal.SOURCE_JSON = 'JSON';
    CommentProviderInternal.SOURCE_XML = 'XML';
    CommentProviderInternal.SOURCE_TEXT = 'TEXT';

    /**
     * Provider for HTTP content. This returns a promise that resolves to TEXT.
     *
     * @param {string} method - HTTP method to use
     * @param {string} url - Base URL
     * @param {string} responseType - type of response expected.
     * @param {Object} args - Arguments for query string. Note: This is only used when
     *               method is POST or PUT
     * @param {any} body - Text body content. If not provided will omit a body
     * @return {Promise} that resolves or rejects based on the success or failure
     *         of the request
     **/
    CommentProviderInternal.BaseHttpProvider = function (method, url, responseType, args, body) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            var uri = url;
            if (args && (method === 'POST' || method === 'PUT')) {
                uri += '?';
                var argsArray = [];
                for (var key in args) {
                    if (args.hasOwnProperty(key)) {
                        argsArray.push(encodeURIComponent(key) +
                            '=' + encodeURIComponent(args[key]));
                    }
                }
                uri += argsArray.join('&');
            }

            xhr.onload = function () {
                if (this.status >= 200 && this.status < 300) {
                    resolve(this.response);
                } else {
                    reject(new Error(this.status + " " + this.statusText));
                }
            };

            xhr.onerror = function () {
                reject(new Error(this.status + " " + this.statusText));
            };

            xhr.open(method, uri);

            // Limit the response type based on input
            xhr.responseType = typeof responseType === "string" ?
                responseType : "";

            if (typeof body !== 'undefined') {
                xhr.send(body);
            } else {
                xhr.send();
            }
        });
    };

    /**
     * Provider for JSON content. This returns a promise that resolves to JSON.
     *
     * @param {string} method - HTTP method to use
     * @param {string} url - Base URL
     * @param {Object} args - Arguments for query string. Note: This is only used when
     *               method is POST or PUT
     * @param {any} body - Text body content. If not provided will omit a body
     * @return {Promise} that resolves or rejects based on the success or failure
     *         of the request
     **/
    CommentProviderInternal.JSONProvider = function (method, url, args, body) {
        return CommentProviderInternal.BaseHttpProvider( // Changed CommentProvider to CommentProviderInternal
            method, url, "json", args, body).then(function (response) {
                return response;
            });
    };

    /**
     * Provider for XML content. This returns a promise that resolves to Document.
     *
     * @param {string} method - HTTP method to use
     * @param {string} url - Base URL
     * @param {Object} args - Arguments for query string. Note: This is only used when
     *               method is POST or PUT
     * @param {any} body - Text body content. If not provided will omit a body
     * @return {Promise} that resolves or rejects based on the success or failure
     *         of the request
     **/
    CommentProviderInternal.XMLProvider = function (method, url, args, body) {
        return CommentProviderInternal.BaseHttpProvider( // Changed CommentProvider to CommentProviderInternal
            method, url, "document", args, body).then(function (response) {
                return response;
            });
    };

    /**
     * Provider for text content. This returns a promise that resolves to Text.
     *
     * @param {string} method - HTTP method to use
     * @param {string} url - Base URL
     * @param {Object} args - Arguments for query string. Note: This is only used when
     *               method is POST or PUT
     * @param {any} body - Text body content. If not provided will omit a body
     * @return {Promise} that resolves or rejects based on the success or failure
     *         of the request
     **/
    CommentProviderInternal.TextProvider = function (method, url, args, body) {
        return CommentProviderInternal.BaseHttpProvider( // Changed CommentProvider to CommentProviderInternal
            method, url, "text", args, body).then(function (response) {
                return response;
            });
    };

    /**
     * Attaches a static source to the corresponding type.
     * NOTE: Multiple static sources will race to determine the initial comment
     *       list so it is imperative that they all parse to the SAME content.
     *
     * @param {Provider} source - Promise that resolves to one of the supported types
     * @param {Type} type - Type that the provider resolves to
     * @return {CommentProviderInternal} this
     **/
    CommentProviderInternal.prototype.addStaticSource = function (source, type) {
        if (this._destroyed) {
            throw new Error(
                'Comment provider has been destroyed, ' +
                'cannot attach more sources.');
        }
        if (!(type in this._staticSources)) {
            this._staticSources[type] = [];
        }
        this._staticSources[type].push(source);
        return this;
    };

    /**
     * Attaches a dynamic source to the corresponding type
     * NOTE: Multiple dynamic sources will collectively provide comment data.
     *
     * @param {DynamicProvider} source - Listenable that resolves to one of the supported types
     * @param {Type} type - Type that the provider resolves to
     * @return {CommentProviderInternal} this
     **/
    CommentProviderInternal.prototype.addDynamicSource = function (source, type) {
        if (this._destroyed) {
            throw new Error(
                'Comment provider has been destroyed, ' +
                'cannot attach more sources.');
        }
        if (!(type in this._dynamicSources)) {
            this._dynamicSources[type] = [];
        }
        this._dynamicSources[type].push(source);
        return this;
    };

    /**
     * Attaches a target comment manager so that we can stream comments to it
     *
     * @param {CommentManager} commentManagerInstance - Comment Manager instance to attach to
     * @return {CommentProviderInternal} this
     **/
    CommentProviderInternal.prototype.addTarget = function (commentManagerInstance) { // Renamed param
        if (this._destroyed) {
            throw new Error(
                'Comment provider has been destroyed, '
                + 'cannot attach more targets.');
        }
        if (!(commentManagerInstance instanceof CommentManager)) { // Use the exported CommentManager
            throw new Error(
                'Expected the target to be an instance of CommentManager.');
        }
        this._targets.push(commentManagerInstance);
        return this;
    };

    /**
     * Adds a parser for an incoming data type. If multiple parsers are added,
     * parsers added later take precedence.
     *
     * @param {CommentParser} parser - Parser spec compliant parser
     * @param {Type} type - Type that the provider resolves to
     * @return {CommentProviderInternal} this
     **/
    CommentProviderInternal.prototype.addParser = function (parser, type) {
        if (this._destroyed) {
            throw new Error(
                'Comment provider has been destroyed, ' +
                'cannot attach more parsers.');
        }
        if (!(type in this._parsers)) {
            this._parsers[type] = [];
        }
        this._parsers[type].unshift(parser);
        return this;
    };

    CommentProviderInternal.prototype.applyParsersOne = function (data, type) {
        var self = this; // Keep 'this' context for _parsers
        return new Promise(function (resolve, reject) {
            if (!(type in self._parsers)) {
                reject(new Error('No parsers defined for "' + type + '"'));
                return;
            }
            for (var i = 0; i < self._parsers[type].length; i++) {
                var output = null;
                try {
                    output = self._parsers[type][i].parseOne(data);
                } catch (e) {
                    // TODO: log this failure
                    console.error(e);
                }
                if (output !== null) {
                    resolve(output);
                    return;
                }
            }
            reject(new Error("Ran out of parsers for they target type"));
        });
    };

    CommentProviderInternal.prototype.applyParsersList = function (data, type) {
        var self = this; // Keep 'this' context for _parsers
        return new Promise(function (resolve, reject) {
            if (!(type in self._parsers)) {
                reject(new Error('No parsers defined for "' + type + '"'));
                return;
            }
            for (var i = 0; i < self._parsers[type].length; i++) {
                var output = null;
                try {
                    output = self._parsers[type][i].parseMany(data);
                } catch (e) {
                    // TODO: log this failure
                    console.error(e);
                }
                if (output !== null) {
                    resolve(output);
                    return;
                }
            }
            reject(new Error("Ran out of parsers for the target type"));
        });
    };

    /**
     * (Re)loads static comments
     *
     * @return {Promise} that is resolved when the static sources have been
     *         loaded
     */
    CommentProviderInternal.prototype.load = function () {
        if (this._destroyed) {
            throw new Error('Cannot load sources on a destroyed provider.');
        }
        var promises = [];
        var self = this; // Keep 'this' context
        // TODO: This race logic needs to be rethought to provide redundancy
        for (var type in this._staticSources) {
            promises.push(Promises.any(this._staticSources[type]) // Assuming Promises is available
                .then((function (currentType) { // Closure for type
                    return function (data) {
                        return self.applyParsersList(data, currentType);
                    };
                })(type)));
        }
        if (promises.length === 0) {
            // No static loaders
            return Promise.resolve([]);
        }
        return Promises.any(promises).then(function (commentList) { // Assuming Promises is available
            for (var i = 0; i < self._targets.length; i++) {
                self._targets[i].load(commentList);
            }
            return Promise.resolve(commentList);
        });
    };

    /**
     * Commit the changes and boot up the provider
     *
     * @return {Promise} that is resolved when all the static sources are loaded
     *         and all the dynamic sources are hooked up
     **/
    CommentProviderInternal.prototype.start = function () {
        if (this._destroyed) {
            throw new Error('Cannot start a provider that has been destroyed.');
        }
        this._started = true;
        var self = this; // Keep 'this' context
        return this.load().then(function (commentList) {
            // Bind the dynamic sources
            for (var type in self._dynamicSources) {
                self._dynamicSources[type].forEach(function (source) {
                    source.addEventListener('receive', function (data) {
                        for (var i = 0; i < self._targets.length; i++) {
                            // This should be applyParsersOne, not applyParserOne
                            self.applyParsersOne(data, type).then(parsedData => { // Added .then for Promise
                                self._targets[i].send(parsedData); // send expected a single comment, or array handled by CM
                            }).catch(err => console.error("Error parsing dynamic comment:", err));
                        }
                    });
                });
            }
            return Promise.resolve(commentList);
        });
    };

    /**
     * Send out comments to both dynamic sources and POST targets.
     *
     * @param commentData - commentData to be sent to the server. Object.
     * @param requireAll - Do we require that all servers to accept the comment
     *                     for the promise to resolve. Defaults to true. If
     *                     false, the returned promise will resolve as long as a
     *                     single target accepts.
     * @return Promise that is resolved when the server accepts or rejects the
     *         comment. Dynamic sources will decide based on their promise while
     *         POST targets are considered accepted if they return a successful
     *         HTTP response code.
     **/
    CommentProviderInternal.prototype.send = function (commentData, requireAll) {
        throw new Error('Not implemented');
    };

    /**
     * Stop providing dynamic comments to the targets
     *
     * @return Promise that is resolved when all bindings between dynamic
     *         sources have been successfully unloaded.
     **/
    CommentProviderInternal.prototype.destroy = function () {
        if (this._destroyed) {
            return Promise.resolve();
        }
        // TODO: implement debinding for sources
        this._destroyed = true;
        return Promise.resolve();
    };

    return CommentProviderInternal;
})();

/**
 * Promises extra functionality
 * @license MIT
 * @author Jim Chen
 */
export const Promises = (function () {

    var Promises = {};

    /**
     * Resolves as soon as any promise resolves in the order of the input array
     * 
     * @param arr - array of promises
     * @return promise that resolves if any one promise resolves and rejects
     *         if otherwise
     **/
    Promises.any = function (promises) {
        if (!Array.isArray(promises)) {
            // Is raw object or promise, resolve it directly
            return Promise.resolve(promises);
        }
        if (promises.length === 0) {
            // No promises to resolve so we think it failed
            return Promise.reject(new Error("No promises to resolve")); // Added Error object for rejection
        }
        return new Promise(function (resolve, reject) {
            var hasResolved = false;
            var hasCompleted = 0;
            var errors = [];
            if (promises.length === 0) { // Redundant check, already handled.
                reject(new Error("Promises.any was called with an empty array.")); // Added error object
                return;
            }
            promises.forEach(function (promise, i) { // Added index i for error array
                Promise.resolve(promise).then(function (value) { // Ensure it's a promise
                    hasCompleted++;
                    if (!hasResolved) {
                        hasResolved = true;
                        resolve(value);
                    }
                }).catch(function (e) {
                    hasCompleted++;
                    errors[i] = e; // Store error with index
                    if (hasCompleted === promises.length) {
                        // All promises have completed and we are in rejecting case
                        if (!hasResolved) {
                            reject(errors);
                        }
                    }
                });
            });
        });
    };

    return Promises;
})();

/** 
 * Bilibili Format Parser
 * Takes in an XMLDoc/LooseXMLDoc and parses that into a Generic Comment List
 * @license MIT License
 **/
export const BilibiliFormat = (function () {
    var BilibiliFormat = {};

    // Fix comments to be valid
    var _format = function (text) {
        return text.replace(/\t/, "\\t");
    };

    // Fix Mode7 comments when they are bad
    var _formatmode7 = function (text) {
        if (text.charAt(0) === '[') {
            switch (text.charAt(text.length - 1)) {
                case ']':
                    return text;
                case '"':
                    return text + ']';
                case ',':
                    return text.substring(0, text.length - 1) + '"]';
                default:
                    // Potentially problematic recursion if char is not removed
                    var newText = text.substring(0, text.length - 1);
                    if (newText === text) return text; // Break if no change
                    return _formatmode7(newText);
            }
        } else {
            return text;
        }
    };

    // Try to escape unsafe HTML code. DO NOT trust that this handles all cases
    // Please do not allow insecure DOM parsing unless you can trust your input source.
    var _escapeUnsafe = function (text) {
        text = text.replace(new RegExp('</([^d])', 'g'), '</disabled $1');
        text = text.replace(new RegExp('</(\\S{2,})', 'g'), '</disabled $1');
        text = text.replace(new RegExp('<([^d/]\\W*?)', 'g'), '<disabled $1');
        text = text.replace(new RegExp('<([^/ ]{2,}\\W*?)', 'g'), '<disabled $1');
        return text;
    };

    function XMLParser(params) { // Changed to function declaration for constructor
        this._attemptFix = true;
        this._logBadComments = true;
        if (typeof params === 'object') {
            this._attemptFix = params.attemptFix === false ? false : true;
            this._logBadComments = params.logBadComments === false ? false : true;
        }
    }
    BilibiliFormat.XMLParser = XMLParser;


    BilibiliFormat.XMLParser.prototype.parseOne = function (elem) {
        try {
            var params = elem.getAttribute('p').split(',');
        } catch (e) {
            // Probably not XML
            return null;
        }
        var text = elem.textContent;
        var comment = {};
        comment.stime = Math.round(parseFloat(params[0]) * 1000);
        comment.size = parseInt(params[2]);
        comment.color = parseInt(params[3]);
        comment.mode = parseInt(params[1]);
        comment.date = parseInt(params[4]);
        comment.pool = parseInt(params[5]);
        comment.position = 'absolute';
        if (params[7] != null) {
            comment.dbid = parseInt(params[7]);
        }
        comment.hash = params[6];
        comment.border = false;
        if (comment.mode < 7) {
            comment.text = text.replace(/(\/n|\\n|\n|\r\n)/g, "\n");
        } else {
            if (comment.mode === 7) {
                try {
                    if (this._attemptFix) {
                        text = _format(_formatmode7(text));
                    }
                    var extendedParams = JSON.parse(text);
                    comment.shadow = true;
                    comment.x = parseFloat(extendedParams[0]);
                    comment.y = parseFloat(extendedParams[1]);
                    if (Math.floor(comment.x) < comment.x || Math.floor(comment.y) < comment.y) {
                        comment.position = 'relative';
                    }
                    comment.text = extendedParams[4].replace(/(\/n|\\n|\n|\r\n)/g, "\n");
                    comment.rZ = 0;
                    comment.rY = 0;
                    if (extendedParams.length >= 7) {
                        comment.rZ = parseInt(extendedParams[5], 10);
                        comment.rY = parseInt(extendedParams[6], 10);
                    }
                    comment.motion = [];
                    comment.movable = false;
                    if (extendedParams.length >= 11) {
                        comment.movable = true;
                        var singleStepDur = 500; // Default single step duration
                        var motionData = { // Use a temporary object for motion data
                            'x': {
                                'from': comment.x,
                                'to': parseFloat(extendedParams[7]),
                                'dur': singleStepDur, // Initialize with default
                                'delay': 0
                            },
                            'y': {
                                'from': comment.y,
                                'to': parseFloat(extendedParams[8]),
                                'dur': singleStepDur, // Initialize with default
                                'delay': 0
                            }
                        };
                        if (extendedParams[9] !== '') { // Duration for x and y
                            singleStepDur = parseInt(extendedParams[9], 10);
                            motionData.x.dur = singleStepDur;
                            motionData.y.dur = singleStepDur;
                        }
                        if (extendedParams[10] !== '') { // Delay for x and y
                            var delay = parseInt(extendedParams[10], 10);
                            motionData.x.delay = delay;
                            motionData.y.delay = delay;
                        }
                        var finalMotion = null; // To store the motion object to be pushed

                        if (extendedParams.length > 11) {
                            comment.shadow = (extendedParams[11] !== 'false' && extendedParams[11] !== false);
                            if (extendedParams[12] != null) {
                                comment.font = extendedParams[12];
                            }
                            if (extendedParams.length > 14 && extendedParams[14] !== "") { // Check if path is defined
                                // Support for Bilibili advanced Paths
                                if (comment.position === 'relative') {
                                    if (this._logBadComments) {
                                        console.warn('Cannot mix relative and absolute positioning for path animation! Path animation will use absolute.');
                                    }
                                    comment.position = 'absolute'; // Path animations imply absolute target points usually
                                }
                                var path = extendedParams[14];
                                var lastPoint = {
                                    x: motionData.x.from, // Start from initial position
                                    y: motionData.y.from
                                };
                                var pathMotionSteps = []; // Store steps of path motion
                                var regex = new RegExp('([a-zA-Z])\\s*(-?\\d+)[, ](-?\\d+)', 'g'); // Allow negative coords
                                var counts = (path.match(/[a-zA-Z]/g) || []).length; // Count actual commands
                                var m = regex.exec(path);
                                var overallPathDuration = motionData.x.dur; // Use the overall duration for the path segments

                                while (m !== null) {
                                    var cmdType = m[1];
                                    var toX = parseInt(m[2], 10);
                                    var toY = parseInt(m[3], 10);

                                    switch (cmdType) {
                                        case 'M': {
                                            lastPoint.x = toX;
                                            lastPoint.y = toY;
                                        }
                                            break;
                                        case 'L': {
                                            pathMotionSteps.push({
                                                'x': {
                                                    'from': lastPoint.x,
                                                    'to': toX,
                                                    'dur': counts > 0 ? overallPathDuration / counts : 0, // Distribute duration
                                                    'delay': 0 // Path segments are sequential, delay is effectively handled by sequence
                                                },
                                                'y': {
                                                    'from': lastPoint.y,
                                                    'to': toY,
                                                    'dur': counts > 0 ? overallPathDuration / counts : 0,
                                                    'delay': 0
                                                }
                                            });
                                            lastPoint.x = toX;
                                            lastPoint.y = toY;
                                        }
                                            break;
                                    }
                                    m = regex.exec(path);
                                }
                                if (pathMotionSteps.length > 0) {
                                    comment.motion = pathMotionSteps; // Assign path motion
                                    finalMotion = null; // Path motion takes precedence
                                } else {
                                    finalMotion = motionData; // Fallback to simple motion if path is empty/invalid
                                }
                            } else {
                                finalMotion = motionData; // No path, use simple motion
                            }
                        } else {
                            finalMotion = motionData; // Not enough params for advanced features, use simple motion
                        }

                        if (finalMotion !== null) { // Push the determined motion (simple or none if path took over)
                            comment.motion.push(finalMotion);
                        }
                    } // End movable check (extendedParams.length >= 11)
                    comment.dur = 2500; // Default duration
                    if (extendedParams[3] < 12 && extendedParams[3] > 0) { // Ensure duration is positive
                        comment.dur = extendedParams[3] * 1000;
                    }
                    var tmp = extendedParams[2].split('-');
                    if (tmp != null && tmp.length > 1) {
                        var alphaFrom = parseFloat(tmp[0]);
                        var alphaTo = parseFloat(tmp[1]);
                        comment.opacity = alphaFrom; // Initial opacity
                        if (alphaFrom !== alphaTo) {
                            comment.alpha = { // Alpha transition
                                'from': alphaFrom,
                                'to': alphaTo
                            };
                        }
                    }
                } catch (e) {
                    if (this._logBadComments) {
                        console.warn('Error occurred in JSON parsing for mode 7. Could not parse comment.');
                        console.log('[DEBUG] ' + text, e);
                    }
                }
            } else if (comment.mode === 8) {
                comment.code = text; // Code comments are special. Treat them that way.
            } else {
                if (this._logBadComments) {
                    console.warn('Unknown comment type : ' + comment.mode + '. Not doing further parsing.');
                    console.log('[DEBUG] ' + text);
                }
            }
        }
        if (comment.text !== null && typeof comment.text === 'string') {
            comment.text = comment.text.replace(/\u25a0/g, "\u2588");
        }
        return comment;
    };

    BilibiliFormat.XMLParser.prototype.parseMany = function (xmldoc) {
        var elements = [];
        try {
            elements = xmldoc.getElementsByTagName('d');
        } catch (e) {
            // TODO: handle XMLDOC errors.
            return null; // Bail, I can't handle
        }
        var commentList = [];
        for (var i = 0; i < elements.length; i++) {
            var comment = this.parseOne(elements[i]);
            if (comment !== null) {
                commentList.push(comment);
            }
        }
        return commentList;
    };

    function TextParser(params) { // Changed to function declaration
        this._allowInsecureDomParsing = true;
        this._attemptEscaping = true;
        this._canSecureNativeParse = false;
        if (typeof params === 'object') {
            this._allowInsecureDomParsing = params.allowInsecureDomParsing === false ? false : true;
            this._attemptEscaping = params.attemptEscaping === false ? false : true;
        }
        if (typeof document === 'undefined' || !document || !document.createElement) {
            // We can't rely on innerHTML anyways. Maybe we're in a restricted context (i.e. node).
            this._allowInsecureDomParsing = false;
        }
        if (typeof DOMParser !== 'undefined' && DOMParser !== null) {
            this._canSecureNativeParse = true;
        }
        if (this._allowInsecureDomParsing || this._canSecureNativeParse) {
            this._xmlParser = new BilibiliFormat.XMLParser(params);
        }
    }
    BilibiliFormat.TextParser = TextParser;


    BilibiliFormat.TextParser.prototype.parseOne = function (comment) {
        // Attempt to parse a single tokenized tag
        if (this._allowInsecureDomParsing) {
            var source = comment;
            if (this._attemptEscaping) {
                source = _escapeUnsafe(source);
            }
            var temp = document.createElement('div');
            temp.innerHTML = source;
            var tags = temp.getElementsByTagName('d');
            if (tags.length !== 1) {
                return null; // Can't parse, delegate
            } else {
                return this._xmlParser.parseOne(tags[0]);
            }
        } else if (this._canSecureNativeParse) {
            var domParser = new DOMParser();
            // Parse as XML document, then get the 'd' element
            var xmlDoc = domParser.parseFromString(comment, 'application/xml');
            var dElements = xmlDoc.getElementsByTagName('d');
            if (dElements.length === 1) {
                return this._xmlParser.parseOne(dElements[0]);
            }
            return null;
        } else {
            throw new Error('Secure native js parsing not implemented yet, and insecure DOM parsing is disabled.');
        }
    };

    BilibiliFormat.TextParser.prototype.parseMany = function (comment) {
        // Attempt to parse a comment list
        if (this._allowInsecureDomParsing) {
            var source = comment;
            if (this._attemptEscaping) {
                source = _escapeUnsafe(source);
            }
            var temp = document.createElement('div');
            temp.innerHTML = source;
            return this._xmlParser.parseMany(temp);
        } else if (this._canSecureNativeParse) {
            var domParser = new DOMParser();
            return this._xmlParser.parseMany(
                domParser.parseFromString(comment, 'application/xml'));
        } else {
            throw new Error('Secure native js parsing not implemented yet, and insecure DOM parsing is disabled.');
        }
    };

    return BilibiliFormat;
})();

/**
 * AcFun Format Parser
 * Takes in JSON and parses it based on current documentation for AcFun comments
 * @license MIT License
 **/
export const AcfunFormat = (function () {
    var AcfunFormat = {};

    function JSONParser(params) { // Changed to function declaration
        this._logBadComments = true;
        this._logNotImplemented = false;
        if (typeof params === 'object') {
            this._logBadComments = params.logBadComments === false ? false : true;
            this._logNotImplemented = params.logNotImplemented === true ? true : false;
        }
    }
    AcfunFormat.JSONParser = JSONParser;

    AcfunFormat.JSONParser.prototype.parseOne = function (comment) {
        // Read a comment and generate a correct comment object
        var data = {};
        if (typeof comment !== 'object' || comment == null || !comment.hasOwnProperty('c')) {
            // This cannot be parsed. The comment contains no config data
            return null;
        }
        var config = comment['c'].split(',');
        if (config.length >= 6) {
            data.stime = parseFloat(config[0]) * 1000;
            data.color = parseInt(config[1])
            data.mode = parseInt(config[2]);
            data.size = parseInt(config[3]);
            data.hash = config[4];
            data.date = parseInt(config[5]);
            data.position = "absolute";
            if (data.mode !== 7) {
                // Do some text normalization on low complexity comments
                data.text = comment.m.replace(/(\/n|\\n|\n|\r\n|\\r)/g, "\n");
                data.text = data.text.replace(/\r/g, "\n");
                data.text = data.text.replace(/\s/g, "\u00a0");
            } else {
                try {
                    var x = JSON.parse(comment.m);
                } catch (e) {
                    if (this._logBadComments) {
                        console.warn('Error parsing internal data for comment mode 7');
                        console.log('[Dbg] ' + comment.m, e);
                    }
                    return null; // Can't actually parse this!
                }
                data.position = "relative";
                data.text = x.n; /*.replace(/\r/g,"\n");*/ // Original had this commented out.
                data.text = data.text.replace(/\s/g, "\u00a0"); // Replaced space with non-breaking space
                if (typeof x.a === 'number') {
                    data.opacity = x.a;
                } else {
                    data.opacity = 1;
                }
                if (typeof x.p === 'object') {
                    // Relative position
                    data.x = x.p.x / 1000;
                    data.y = x.p.y / 1000;
                } else {
                    data.x = 0;
                    data.y = 0;
                }
                if (typeof x.c === 'number') { // Alignment
                    switch (x.c) {
                        case 0: data.align = 0; break; // Top Left
                        case 2: data.align = 1; break; // Top Right
                        case 6: data.align = 2; break; // Bottom Left
                        case 8: data.align = 3; break; // Bottom Right
                        // AcFun documentation on alignment can be tricky. CCL align is about origin.
                        // 0: top-left, 1: top-right, 2: btm-left, 3: btm-right
                        // This might need adjustment based on how parent.width/height and x/y are used.
                        default:
                            if (this._logNotImplemented) {
                                console.log('AcFun: Cannot handle aligning to center or other modes! AlignMode=' + x.c);
                            }
                    }
                }
                // Use default axis (horizontal for x, vertical for y)
                data.axis = 0; // Default: 0 for X right-to-left/Y top-to-bottom
                data.shadow = x.b !== undefined ? x.b : true; // Default shadow to true if not specified
                data.dur = 4000; // Default duration
                if (typeof x.l === 'number' && x.l > 0) { // Life duration of comment in seconds
                    data.dur = x.l * 1000;
                }
                if (x.z != null && x.z.length > 0) { // Motion path
                    data.movable = true;
                    data.motion = [];
                    var cumulativeDelay = 0; // AcFun 'l' in path is duration of segment, not total.
                    var lastState = {
                        x: data.x,
                        y: data.y,
                        alpha: data.opacity,
                        color: data.color // Assuming initial color is from main comment data
                    };
                    for (var m = 0; m < x.z.length; m++) {
                        var segment = x.z[m];
                        var segmentDuration = segment.l != null ? (segment.l * 1000) : 500; // Duration of this segment

                        var motionSegment = { // For properties that change in this segment
                            // delay: cumulativeDelay // Delay of this segment from start of whole animation
                        };

                        var hasMotion = false;

                        if (segment.hasOwnProperty('x') && typeof segment.x === 'number') {
                            motionSegment.x = {
                                from: lastState.x,
                                to: segment.x / 1000,
                                dur: segmentDuration,
                                delay: 0 // Delay within this step, usually 0 for path segments
                            };
                            lastState.x = motionSegment.x.to;
                            hasMotion = true;
                        }
                        if (segment.hasOwnProperty('y') && typeof segment.y === 'number') {
                            motionSegment.y = {
                                from: lastState.y,
                                to: segment.y / 1000,
                                dur: segmentDuration,
                                delay: 0
                            };
                            lastState.y = motionSegment.y.to;
                            hasMotion = true;
                        }
                        if (segment.hasOwnProperty('t') && typeof segment.t === 'number' && segment.t !== lastState.alpha) {
                            motionSegment.alpha = {
                                from: lastState.alpha,
                                to: segment.t,
                                dur: segmentDuration,
                                delay: 0
                            };
                            lastState.alpha = motionSegment.alpha.to;
                            hasMotion = true;
                        }
                        if (segment.hasOwnProperty('c') && typeof segment.c === 'number' && segment.c !== lastState.color) {
                            motionSegment.color = {
                                from: lastState.color,
                                to: segment.c,
                                dur: segmentDuration,
                                delay: 0
                            };
                            lastState.color = motionSegment.color.to;
                            hasMotion = true;
                        }

                        // Add rotation if specified (r, e, d for x,y,z rot)
                        // These are typically absolute rotations for the state, not transitions by default in CCL motion
                        // For simplicity, we'll assume these set a final state if defined, or would need complex handling
                        // if (segment.hasOwnProperty('r')) lastState.rX = segment.r;
                        // if (segment.hasOwnProperty('e')) lastState.rY = segment.e;
                        // if (segment.hasOwnProperty('d')) lastState.rZ = segment.d;


                        if (hasMotion) data.motion.push(motionSegment);
                        // cumulativeDelay += segmentDuration; // Next segment starts after this one ends
                    }
                    // CCL's `dur` for the comment is the total time it's on screen.
                    // If motion defines total time, that should be `data.dur`.
                    // The `dur` property in CCL motion objects is for that specific property's transition.
                    // For AcFun, the overall comment duration `x.l` (data.dur) is for the entire comment visibility.
                    // Motion path segments `x.z[m].l` are durations for each step.
                    // The `CoreComment` animate function iterates through motion objects.
                } // End motion path handling

                if (x.hasOwnProperty('w')) { // Font Weight / Style
                    if (x.w.hasOwnProperty('f')) {
                        data.font = x.w.f; // Font family
                    }
                    // x.w.l might be related to stroke/shadow effects, not directly supported by simple font property
                    if (x.w.hasOwnProperty('l') && Array.isArray(x.w.l)) {
                        if (x.w.l.length > 0) {
                            if (this._logNotImplemented) {
                                console.log('[AcFun Dbg] Filters/effects in x.w.l not directly supported: ' +
                                    JSON.stringify(x.w.l));
                            }
                        }
                    }
                }
                if (x.r != null && x.k != null) { // Initial 2D Rotation (r for angle, k for what?)
                    // AcFun docs are sparse here. Assuming 'r' is rotationZ.
                    data.rZ = x.r; // Assuming r is rotation Z. k's purpose unclear.
                    // If 'k' is related to rotation Y, then data.rY = x.k;
                }

            } // End mode 7
            return data;
        } else {
            // Not enough arguments.
            if (this._logBadComments) {
                console.warn('AcFun: Dropping this comment due to insufficient parameters in "c". Got: ' + config.length);
                console.log('[AcFun Dbg] ' + comment['c']);
            }
            return null;
        }
    };

    AcfunFormat.JSONParser.prototype.parseMany = function (comments) {
        if (!Array.isArray(comments)) {
            return null;
        }
        var list = [];
        for (var i = 0; i < comments.length; i++) {
            var comment = this.parseOne(comments[i]);
            if (comment !== null) {
                list.push(comment);
            }
        }
        return list;
    };

    function TextParser(param) { // Changed to function declaration
        this._jsonParser = new AcfunFormat.JSONParser(param);
    }
    AcfunFormat.TextParser = TextParser;


    AcfunFormat.TextParser.prototype.parseOne = function (comment) {
        try {
            return this._jsonParser.parseOne(JSON.parse(comment));
        } catch (e) {
            console.warn(e);
            return null;
        }
    }

    AcfunFormat.TextParser.prototype.parseMany = function (comment) {
        try {
            return this._jsonParser.parseMany(JSON.parse(comment));
        } catch (e) {
            console.warn(e);
            return null;
        }
    }

    return AcfunFormat;
})();

/**
 * CommonDanmakuFormat Parser
 * Example parser for parsing comments that the CCL can accept directly.
 * @license MIT
 * @author Jim Chen
 **/

export const CommonDanmakuFormat = (function () {
    var CommonDanmakuFormat = {};
    var _check = function (comment) {
        // Sanity check to see if we should be parsing these comments or not
        if (typeof comment.mode !== 'number' || typeof comment.stime !== 'number') {
            return false;
        }
        if (comment.mode === 8 && !(typeof comment.code === 'string')) {
            return false;
        }
        if (typeof comment.text !== 'string') { // All modes should have text (even if empty for mode 8 initially)
            return false;
        }
        return true;
    };

    function JSONParser() { } // Changed to function declaration
    CommonDanmakuFormat.JSONParser = JSONParser;

    CommonDanmakuFormat.JSONParser.prototype.parseOne = function (comment) {
        // Refuse to parse the comment does not pass sanity check
        return _check(comment) ? comment : null;
    };

    CommonDanmakuFormat.JSONParser.prototype.parseMany = function (comments) {
        // Refuse to parse if any comment does not pass sanity check
        if (!Array.isArray(comments)) return null; // Ensure it's an array
        return comments.every(_check) ? comments : null;
    };

    function XMLParser() { } // Changed to function declaration
    CommonDanmakuFormat.XMLParser = XMLParser;

    CommonDanmakuFormat.XMLParser.prototype.parseOne = function (commentNode) { // Renamed param
        var data = {}
        try {
            data.stime = parseInt(commentNode.getAttribute('stime'));
            data.mode = parseInt(commentNode.getAttribute('mode'));
            data.size = parseInt(commentNode.getAttribute('size'));
            data.color = parseInt(commentNode.getAttribute('color'));
            data.text = commentNode.textContent;
            // Add other potential attributes if needed by CommonDanmakuFormat spec (e.g. date, pool, hash, dbid)
            if (commentNode.hasAttribute('date')) data.date = parseInt(commentNode.getAttribute('date'));
            // ... etc.
        } catch (e) {
            return null;
        }
        return _check(data) ? data : null; // Validate the parsed data
    };

    CommonDanmakuFormat.XMLParser.prototype.parseMany = function (commentsElem) {
        try {
            var commentNodes = commentsElem.getElementsByTagName('comment'); // Renamed var
        } catch (e) {
            return null;
        }
        var commentList = [];
        for (var i = 0; i < commentNodes.length; i++) {
            var comment = this.parseOne(commentNodes[i]);
            if (comment !== null) {
                commentList.push(comment);
            }
        }
        return commentList;
    };

    return CommonDanmakuFormat;
})();
