(module
  ;; Memory: 4 pages (256KB) — enough for grid + mst_edges + segments output
  ;; Layout:
  ;;   0x00000 .. 0x03FFF  grid_values   (64*64*4 = 16384 bytes)
  ;;   0x04000 .. 0x07FFF  mst_edges     (up to 1024 edges * 16 bytes = 16384)
  ;;   0x08000 .. 0x27FFF  segments_out  (63*63*2*16 = 127008 bytes, rounded up to 128KB)
  (memory (export "memory") 4)

  ;; ── Math helpers ──

  ;; f32.max — WASM has this as an instruction
  ;; f32.min — same
  ;; f32.sqrt — same

  ;; ── dist_to_segment_sq(px, py, ax, ay, bx, by) -> f32 ──
  ;; Squared distance from point (px,py) to nearest point on segment (ax,ay)→(bx,by)
  (func $dist_to_segment_sq
    (param $px f32) (param $py f32)
    (param $ax f32) (param $ay f32)
    (param $bx f32) (param $by f32)
    (result f32)
    (local $dx f32) (local $dy f32) (local $lenSq f32)
    (local $t f32) (local $nearX f32) (local $nearY f32)
    (local $ex f32) (local $ey f32)

    ;; dx = bx - ax, dy = by - ay
    (local.set $dx (f32.sub (local.get $bx) (local.get $ax)))
    (local.set $dy (f32.sub (local.get $by) (local.get $ay)))
    (local.set $lenSq (f32.add
      (f32.mul (local.get $dx) (local.get $dx))
      (f32.mul (local.get $dy) (local.get $dy))
    ))

    ;; If degenerate segment
    (if (f32.lt (local.get $lenSq) (f32.const 1e-12))
      (then
        (local.set $ex (f32.sub (local.get $px) (local.get $ax)))
        (local.set $ey (f32.sub (local.get $py) (local.get $ay)))
        (return (f32.add
          (f32.mul (local.get $ex) (local.get $ex))
          (f32.mul (local.get $ey) (local.get $ey))
        ))
      )
    )

    ;; t = clamp(((px-ax)*dx + (py-ay)*dy) / lenSq, 0, 1)
    (local.set $t (f32.div
      (f32.add
        (f32.mul (f32.sub (local.get $px) (local.get $ax)) (local.get $dx))
        (f32.mul (f32.sub (local.get $py) (local.get $ay)) (local.get $dy))
      )
      (local.get $lenSq)
    ))
    (local.set $t (f32.max (f32.const 0) (f32.min (f32.const 1) (local.get $t))))

    ;; nearX = ax + t*dx, nearY = ay + t*dy
    (local.set $nearX (f32.add (local.get $ax) (f32.mul (local.get $t) (local.get $dx))))
    (local.set $nearY (f32.add (local.get $ay) (f32.mul (local.get $t) (local.get $dy))))

    ;; ex = px - nearX, ey = py - nearY
    (local.set $ex (f32.sub (local.get $px) (local.get $nearX)))
    (local.set $ey (f32.sub (local.get $py) (local.get $nearY)))

    (f32.add
      (f32.mul (local.get $ex) (local.get $ex))
      (f32.mul (local.get $ey) (local.get $ey))
    )
  )

  ;; ── exp approximation ──
  ;; Fast exp(x) for x in [-20, 0] range (all our inputs are negative or zero)
  ;; Uses the identity: exp(x) = 2^(x / ln2)
  ;; Then: 2^y = 2^floor(y) * 2^frac(y)
  ;; 2^frac(y) approximated by polynomial
  (func $exp_approx (param $x f32) (result f32)
    (local $y f32) (local $yi i32) (local $yf f32) (local $pow2frac f32)
    (local $bits i32)

    ;; Early exit for very negative values
    (if (f32.lt (local.get $x) (f32.const -20.0))
      (then (return (f32.const 0.0)))
    )
    (if (f32.ge (local.get $x) (f32.const 0.0))
      (then (return (f32.const 1.0)))
    )

    ;; y = x / ln(2) = x * 1.442695
    (local.set $y (f32.mul (local.get $x) (f32.const 1.4426950408889634)))

    ;; yi = floor(y)  (integer part, negative)
    (local.set $yi (i32.trunc_f32_s (f32.floor (local.get $y))))

    ;; yf = y - yi  (fractional part in [0, 1))
    (local.set $yf (f32.sub (local.get $y) (f32.convert_i32_s (local.get $yi))))

    ;; 2^frac via minimax polynomial: 1 + 0.6931472*yf + 0.2402265*yf^2 + 0.0554953*yf^3 + 0.00967*yf^4
    (local.set $pow2frac
      (f32.add (f32.const 1.0)
        (f32.mul (local.get $yf)
          (f32.add (f32.const 0.6931472)
            (f32.mul (local.get $yf)
              (f32.add (f32.const 0.2402265)
                (f32.mul (local.get $yf)
                  (f32.add (f32.const 0.0554953)
                    (f32.mul (local.get $yf) (f32.const 0.00967))
                  )
                )
              )
            )
          )
        )
      )
    )

    ;; 2^yi: construct float via bit manipulation
    ;; IEEE 754 float: 2^n = bits ((n+127) << 23) for n in [-126, 127]
    (if (i32.lt_s (local.get $yi) (i32.const -126))
      (then (return (f32.const 0.0)))
    )
    (local.set $bits (i32.shl (i32.add (local.get $yi) (i32.const 127)) (i32.const 23)))

    (f32.mul (f32.reinterpret_i32 (local.get $bits)) (local.get $pow2frac))
  )

  ;; ── add_bridge_field ──
  ;; Params:
  ;;   grid_ptr: i32        byte offset to grid values (Float32Array)
  ;;   cols: i32
  ;;   rows: i32
  ;;   origin_x: f32
  ;;   origin_y: f32
  ;;   cell_size: f32
  ;;   mst_ptr: i32          byte offset to MST edges [ax, ay, bx, by, ...]
  ;;   num_mst_edges: i32
  ;;   base_sigma: f32
  (func (export "add_bridge_field")
    (param $grid_ptr i32) (param $cols i32) (param $rows i32)
    (param $origin_x f32) (param $origin_y f32) (param $cell_size f32)
    (param $mst_ptr i32) (param $num_mst_edges i32)
    (param $base_sigma f32)
    (local $i i32)
    (local $edge_off i32)
    (local $ax f32) (local $ay f32) (local $bx f32) (local $by f32)
    (local $edgeLen f32) (local $bridgeSigma f32)
    (local $invTwoSigmaSq f32) (local $cutoff f32) (local $cutoffSq f32)
    (local $segMinX f32) (local $segMaxX f32) (local $segMinY f32) (local $segMaxY f32)
    (local $rMin i32) (local $rMax i32) (local $cMin i32) (local $cMax i32)
    (local $r i32) (local $c i32)
    (local $px f32) (local $py f32)
    (local $dSq f32) (local $val f32) (local $existing f32)
    (local $idx i32)
    (local $baseSigmaAdj f32)
    (local $edx f32) (local $edy f32)
    (local $tmp_floor i32)

    ;; baseSigmaAdj = max(base_sigma, cell_size * 2.5)
    (local.set $baseSigmaAdj (f32.max
      (local.get $base_sigma)
      (f32.mul (local.get $cell_size) (f32.const 2.5))
    ))

    ;; Loop over MST edges
    (local.set $i (i32.const 0))
    (block $break_outer
      (loop $loop_edges
        (br_if $break_outer (i32.ge_s (local.get $i) (local.get $num_mst_edges)))

        ;; Read edge coords: mst_ptr + i * 16  (4 floats * 4 bytes each)
        (local.set $edge_off (i32.add (local.get $mst_ptr) (i32.mul (local.get $i) (i32.const 16))))
        (local.set $ax (f32.load (local.get $edge_off)))
        (local.set $ay (f32.load offset=4 (local.get $edge_off)))
        (local.set $bx (f32.load offset=8 (local.get $edge_off)))
        (local.set $by (f32.load offset=12 (local.get $edge_off)))

        ;; edgeLen = sqrt((bx-ax)^2 + (by-ay)^2)
        (local.set $edx (f32.sub (local.get $bx) (local.get $ax)))
        (local.set $edy (f32.sub (local.get $by) (local.get $ay)))
        (local.set $edgeLen (f32.sqrt (f32.add
          (f32.mul (local.get $edx) (local.get $edx))
          (f32.mul (local.get $edy) (local.get $edy))
        )))

        ;; bridgeSigma = max(baseSigmaAdj, edgeLen * 0.12)
        (local.set $bridgeSigma (f32.max
          (local.get $baseSigmaAdj)
          (f32.mul (local.get $edgeLen) (f32.const 0.12))
        ))

        ;; invTwoSigmaSq = 1 / (2 * bridgeSigma^2)
        (local.set $invTwoSigmaSq (f32.div
          (f32.const 1.0)
          (f32.mul (f32.const 2.0) (f32.mul (local.get $bridgeSigma) (local.get $bridgeSigma)))
        ))

        ;; cutoff = 3 * bridgeSigma
        (local.set $cutoff (f32.mul (f32.const 3.0) (local.get $bridgeSigma)))
        (local.set $cutoffSq (f32.mul (local.get $cutoff) (local.get $cutoff)))

        ;; AABB of segment + cutoff
        (local.set $segMinX (f32.sub (f32.min (local.get $ax) (local.get $bx)) (local.get $cutoff)))
        (local.set $segMaxX (f32.add (f32.max (local.get $ax) (local.get $bx)) (local.get $cutoff)))
        (local.set $segMinY (f32.sub (f32.min (local.get $ay) (local.get $by)) (local.get $cutoff)))
        (local.set $segMaxY (f32.add (f32.max (local.get $ay) (local.get $by)) (local.get $cutoff)))

        ;; rMin = max(0, floor((segMinY - originY) / cellSize))
        (local.set $tmp_floor (i32.trunc_f32_s (f32.floor (f32.div
          (f32.sub (local.get $segMinY) (local.get $origin_y))
          (local.get $cell_size)
        ))))
        ;; rMin = max(0, tmp_floor) via select
        (local.set $rMin (select
          (local.get $tmp_floor)
          (i32.const 0)
          (i32.gt_s (local.get $tmp_floor) (i32.const 0))
        ))

        ;; rMax = min(rows-1, ceil((segMaxY - originY) / cellSize))
        (local.set $tmp_floor (i32.trunc_f32_s (f32.ceil (f32.div
          (f32.sub (local.get $segMaxY) (local.get $origin_y))
          (local.get $cell_size)
        ))))
        ;; rMax = min(rows-1, tmp_floor) via select
        (local.set $rMax (select
          (local.get $tmp_floor)
          (i32.sub (local.get $rows) (i32.const 1))
          (i32.lt_s (local.get $tmp_floor) (i32.sub (local.get $rows) (i32.const 1)))
        ))

        ;; cMin = max(0, floor((segMinX - originX) / cellSize))
        (local.set $tmp_floor (i32.trunc_f32_s (f32.floor (f32.div
          (f32.sub (local.get $segMinX) (local.get $origin_x))
          (local.get $cell_size)
        ))))
        ;; cMin = max(0, tmp_floor) via select
        (local.set $cMin (select
          (local.get $tmp_floor)
          (i32.const 0)
          (i32.gt_s (local.get $tmp_floor) (i32.const 0))
        ))

        ;; cMax = min(cols-1, ceil((segMaxX - originX) / cellSize))
        (local.set $tmp_floor (i32.trunc_f32_s (f32.ceil (f32.div
          (f32.sub (local.get $segMaxX) (local.get $origin_x))
          (local.get $cell_size)
        ))))
        ;; cMax = min(cols-1, tmp_floor) via select
        (local.set $cMax (select
          (local.get $tmp_floor)
          (i32.sub (local.get $cols) (i32.const 1))
          (i32.lt_s (local.get $tmp_floor) (i32.sub (local.get $cols) (i32.const 1)))
        ))

        ;; Loop rows
        (local.set $r (local.get $rMin))
        (block $break_r
          (loop $loop_r
            (br_if $break_r (i32.gt_s (local.get $r) (local.get $rMax)))

            (local.set $py (f32.add (local.get $origin_y)
              (f32.mul (f32.convert_i32_s (local.get $r)) (local.get $cell_size))
            ))

            ;; Loop cols
            (local.set $c (local.get $cMin))
            (block $break_c
              (loop $loop_c
                (br_if $break_c (i32.gt_s (local.get $c) (local.get $cMax)))

                (local.set $px (f32.add (local.get $origin_x)
                  (f32.mul (f32.convert_i32_s (local.get $c)) (local.get $cell_size))
                ))

                ;; dSq = distToSegmentSq(px, py, ax, ay, bx, by)
                (local.set $dSq (call $dist_to_segment_sq
                  (local.get $px) (local.get $py)
                  (local.get $ax) (local.get $ay)
                  (local.get $bx) (local.get $by)
                ))

                (if (f32.lt (local.get $dSq) (local.get $cutoffSq))
                  (then
                    ;; val = exp(-dSq * invTwoSigmaSq)
                    (local.set $val (call $exp_approx
                      (f32.neg (f32.mul (local.get $dSq) (local.get $invTwoSigmaSq)))
                    ))

                    ;; grid[r*cols+c] += val  (additive, matching TS behavior)
                    (local.set $idx (i32.add (local.get $grid_ptr)
                      (i32.shl
                        (i32.add (i32.mul (local.get $r) (local.get $cols)) (local.get $c))
                        (i32.const 2)
                      )
                    ))
                    (local.set $existing (f32.load (local.get $idx)))
                    (f32.store (local.get $idx)
                      (f32.add (local.get $existing) (local.get $val))
                    )
                  )
                )

                (local.set $c (i32.add (local.get $c) (i32.const 1)))
                (br $loop_c)
              )
            )

            (local.set $r (i32.add (local.get $r) (i32.const 1)))
            (br $loop_r)
          )
        )

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop_edges)
      )
    )
  )

  ;; ── lerp1d(v0, v1, threshold) -> f32 ──
  (func $lerp1d (param $v0 f32) (param $v1 f32) (param $threshold f32) (result f32)
    (local $d f32)
    (local.set $d (f32.sub (local.get $v1) (local.get $v0)))
    (if (result f32) (f32.lt (f32.abs (local.get $d)) (f32.const 1e-10))
      (then (f32.const 0.5))
      (else (f32.div
        (f32.sub (local.get $threshold) (local.get $v0))
        (local.get $d)
      ))
    )
  )

  ;; ── get_edge_point: write interpolated point to output ──
  ;; Writes 2 floats (x, y) at out_ptr
  (func $get_edge_point
    (param $grid_ptr i32) (param $cols i32)
    (param $origin_x f32) (param $origin_y f32) (param $cell_size f32)
    (param $r i32) (param $c i32)
    (param $edge i32) (param $threshold f32)
    (param $out_ptr i32)
    (local $tl f32) (local $tr f32) (local $br f32) (local $bl f32)
    (local $x0 f32) (local $y0 f32) (local $x1 f32) (local $y1 f32)
    (local $t f32)
    (local $base_idx i32)

    ;; base index = grid_ptr + (r * cols + c) * 4
    (local.set $base_idx (i32.add (local.get $grid_ptr)
      (i32.shl (i32.add (i32.mul (local.get $r) (local.get $cols)) (local.get $c)) (i32.const 2))
    ))
    (local.set $tl (f32.load (local.get $base_idx)))
    (local.set $tr (f32.load (i32.add (local.get $base_idx) (i32.const 4))))
    ;; Next row: base_idx + cols * 4
    (local.set $bl (f32.load (i32.add (local.get $base_idx) (i32.shl (local.get $cols) (i32.const 2)))))
    (local.set $br (f32.load (i32.add
      (i32.add (local.get $base_idx) (i32.shl (local.get $cols) (i32.const 2)))
      (i32.const 4)
    )))

    (local.set $x0 (f32.add (local.get $origin_x)
      (f32.mul (f32.convert_i32_s (local.get $c)) (local.get $cell_size))
    ))
    (local.set $y0 (f32.add (local.get $origin_y)
      (f32.mul (f32.convert_i32_s (local.get $r)) (local.get $cell_size))
    ))
    (local.set $x1 (f32.add (local.get $x0) (local.get $cell_size)))
    (local.set $y1 (f32.add (local.get $y0) (local.get $cell_size)))

    ;; Switch on edge
    (if (i32.eq (local.get $edge) (i32.const 0))
      (then
        ;; Top edge: tl -> tr
        (local.set $t (call $lerp1d (local.get $tl) (local.get $tr) (local.get $threshold)))
        (f32.store (local.get $out_ptr)
          (f32.add (local.get $x0) (f32.mul (local.get $t) (local.get $cell_size)))
        )
        (f32.store offset=4 (local.get $out_ptr) (local.get $y0))
        (return)
      )
    )
    (if (i32.eq (local.get $edge) (i32.const 1))
      (then
        ;; Right edge: tr -> br
        (local.set $t (call $lerp1d (local.get $tr) (local.get $br) (local.get $threshold)))
        (f32.store (local.get $out_ptr) (local.get $x1))
        (f32.store offset=4 (local.get $out_ptr)
          (f32.add (local.get $y0) (f32.mul (local.get $t) (local.get $cell_size)))
        )
        (return)
      )
    )
    (if (i32.eq (local.get $edge) (i32.const 2))
      (then
        ;; Bottom edge: bl -> br
        (local.set $t (call $lerp1d (local.get $bl) (local.get $br) (local.get $threshold)))
        (f32.store (local.get $out_ptr)
          (f32.add (local.get $x0) (f32.mul (local.get $t) (local.get $cell_size)))
        )
        (f32.store offset=4 (local.get $out_ptr) (local.get $y1))
        (return)
      )
    )
    ;; Default: Left edge (3): tl -> bl
    (local.set $t (call $lerp1d (local.get $tl) (local.get $bl) (local.get $threshold)))
    (f32.store (local.get $out_ptr) (local.get $x0))
    (f32.store offset=4 (local.get $out_ptr)
      (f32.add (local.get $y0) (f32.mul (local.get $t) (local.get $cell_size)))
    )
  )

  ;; ── marching_squares ──
  ;; Returns number of segments written to segments_out
  ;; Each segment is 4 floats: x0, y0, x1, y1
  (func (export "marching_squares")
    (param $grid_ptr i32) (param $cols i32) (param $rows i32)
    (param $origin_x f32) (param $origin_y f32) (param $cell_size f32)
    (param $threshold f32)
    (param $seg_ptr i32)
    (result i32)
    (local $r i32) (local $c i32)
    (local $tl_val f32) (local $tr_val f32) (local $br_val f32) (local $bl_val f32)
    (local $tl i32) (local $tr i32) (local $br i32) (local $bl i32)
    (local $caseIndex i32)
    (local $center f32)
    (local $seg_count i32)
    (local $base_idx i32)
    (local $seg_off i32)
    ;; Edge pair storage (up to 2 pairs, each pair = 2 edge indices)
    (local $pair0_e0 i32) (local $pair0_e1 i32)
    (local $pair1_e0 i32) (local $pair1_e1 i32)
    (local $num_pairs i32)
    (local $p i32)

    (local.set $seg_count (i32.const 0))

    ;; Loop rows: r = 0 to rows-2
    (local.set $r (i32.const 0))
    (block $break_r
      (loop $loop_r
        (br_if $break_r (i32.ge_s (local.get $r) (i32.sub (local.get $rows) (i32.const 1))))

        ;; Loop cols: c = 0 to cols-2
        (local.set $c (i32.const 0))
        (block $break_c
          (loop $loop_c
            (br_if $break_c (i32.ge_s (local.get $c) (i32.sub (local.get $cols) (i32.const 1))))

            ;; Read corner values
            (local.set $base_idx (i32.add (local.get $grid_ptr)
              (i32.shl (i32.add (i32.mul (local.get $r) (local.get $cols)) (local.get $c)) (i32.const 2))
            ))
            (local.set $tl_val (f32.load (local.get $base_idx)))
            (local.set $tr_val (f32.load (i32.add (local.get $base_idx) (i32.const 4))))
            (local.set $bl_val (f32.load (i32.add (local.get $base_idx) (i32.shl (local.get $cols) (i32.const 2)))))
            (local.set $br_val (f32.load (i32.add
              (i32.add (local.get $base_idx) (i32.shl (local.get $cols) (i32.const 2)))
              (i32.const 4)
            )))

            ;; Threshold corners
            (local.set $tl (i32.and (i32.const 1) (i32.ge_u
              (i32.reinterpret_f32 (f32.sub (local.get $tl_val) (local.get $threshold)))
              (i32.const 0)
            )))
            ;; Actually we need: tl = (tl_val >= threshold) ? 1 : 0
            ;; f32.ge returns i32 (0 or 1)
            (local.set $tl (i32.and (i32.const 1)
              (i32.eqz (f32.lt (local.get $tl_val) (local.get $threshold)))
            ))
            (local.set $tr (i32.and (i32.const 1)
              (i32.eqz (f32.lt (local.get $tr_val) (local.get $threshold)))
            ))
            (local.set $br (i32.and (i32.const 1)
              (i32.eqz (f32.lt (local.get $br_val) (local.get $threshold)))
            ))
            (local.set $bl (i32.and (i32.const 1)
              (i32.eqz (f32.lt (local.get $bl_val) (local.get $threshold)))
            ))

            ;; caseIndex = (tl << 3) | (tr << 2) | (br << 1) | bl
            (local.set $caseIndex (i32.or
              (i32.or
                (i32.shl (local.get $tl) (i32.const 3))
                (i32.shl (local.get $tr) (i32.const 2))
              )
              (i32.or
                (i32.shl (local.get $br) (i32.const 1))
                (local.get $bl)
              )
            ))

            ;; Skip cases 0 and 15
            (if (i32.or
              (i32.eqz (local.get $caseIndex))
              (i32.eq (local.get $caseIndex) (i32.const 15))
            )
              (then
                (local.set $c (i32.add (local.get $c) (i32.const 1)))
                (br $loop_c)
              )
            )

            ;; Determine edge pairs based on case index
            ;; Initialize to 1 pair by default
            (local.set $num_pairs (i32.const 1))

            ;; EDGE_TABLE lookup (inline switch)
            ;; Case 1: [[3,2]]
            (if (i32.eq (local.get $caseIndex) (i32.const 1))
              (then
                (local.set $pair0_e0 (i32.const 3)) (local.set $pair0_e1 (i32.const 2))
              )
            )
            ;; Case 2: [[2,1]]
            (if (i32.eq (local.get $caseIndex) (i32.const 2))
              (then
                (local.set $pair0_e0 (i32.const 2)) (local.set $pair0_e1 (i32.const 1))
              )
            )
            ;; Case 3: [[3,1]]
            (if (i32.eq (local.get $caseIndex) (i32.const 3))
              (then
                (local.set $pair0_e0 (i32.const 3)) (local.set $pair0_e1 (i32.const 1))
              )
            )
            ;; Case 4: [[1,0]]
            (if (i32.eq (local.get $caseIndex) (i32.const 4))
              (then
                (local.set $pair0_e0 (i32.const 1)) (local.set $pair0_e1 (i32.const 0))
              )
            )
            ;; Case 5: saddle [[3,0],[1,2]] default, disambiguate with center
            (if (i32.eq (local.get $caseIndex) (i32.const 5))
              (then
                (local.set $center (f32.div (f32.add
                  (f32.add (local.get $tl_val) (local.get $tr_val))
                  (f32.add (local.get $br_val) (local.get $bl_val))
                ) (f32.const 4.0)))
                (local.set $num_pairs (i32.const 2))
                (if (i32.eqz (f32.lt (local.get $center) (local.get $threshold)))
                  (then
                    ;; center >= threshold: [[3,2],[1,0]]
                    (local.set $pair0_e0 (i32.const 3)) (local.set $pair0_e1 (i32.const 2))
                    (local.set $pair1_e0 (i32.const 1)) (local.set $pair1_e1 (i32.const 0))
                  )
                  (else
                    ;; center < threshold: [[3,0],[1,2]]
                    (local.set $pair0_e0 (i32.const 3)) (local.set $pair0_e1 (i32.const 0))
                    (local.set $pair1_e0 (i32.const 1)) (local.set $pair1_e1 (i32.const 2))
                  )
                )
              )
            )
            ;; Case 6: [[2,0]]
            (if (i32.eq (local.get $caseIndex) (i32.const 6))
              (then
                (local.set $pair0_e0 (i32.const 2)) (local.set $pair0_e1 (i32.const 0))
              )
            )
            ;; Case 7: [[3,0]]
            (if (i32.eq (local.get $caseIndex) (i32.const 7))
              (then
                (local.set $pair0_e0 (i32.const 3)) (local.set $pair0_e1 (i32.const 0))
              )
            )
            ;; Case 8: [[0,3]]
            (if (i32.eq (local.get $caseIndex) (i32.const 8))
              (then
                (local.set $pair0_e0 (i32.const 0)) (local.set $pair0_e1 (i32.const 3))
              )
            )
            ;; Case 9: [[0,2]]
            (if (i32.eq (local.get $caseIndex) (i32.const 9))
              (then
                (local.set $pair0_e0 (i32.const 0)) (local.set $pair0_e1 (i32.const 2))
              )
            )
            ;; Case 10: saddle [[0,1],[2,3]] default, disambiguate with center
            (if (i32.eq (local.get $caseIndex) (i32.const 10))
              (then
                (local.set $center (f32.div (f32.add
                  (f32.add (local.get $tl_val) (local.get $tr_val))
                  (f32.add (local.get $br_val) (local.get $bl_val))
                ) (f32.const 4.0)))
                (local.set $num_pairs (i32.const 2))
                (if (i32.eqz (f32.lt (local.get $center) (local.get $threshold)))
                  (then
                    ;; center >= threshold: [[0,3],[2,1]]
                    (local.set $pair0_e0 (i32.const 0)) (local.set $pair0_e1 (i32.const 3))
                    (local.set $pair1_e0 (i32.const 2)) (local.set $pair1_e1 (i32.const 1))
                  )
                  (else
                    ;; center < threshold: [[0,1],[2,3]]
                    (local.set $pair0_e0 (i32.const 0)) (local.set $pair0_e1 (i32.const 1))
                    (local.set $pair1_e0 (i32.const 2)) (local.set $pair1_e1 (i32.const 3))
                  )
                )
              )
            )
            ;; Case 11: [[0,1]]
            (if (i32.eq (local.get $caseIndex) (i32.const 11))
              (then
                (local.set $pair0_e0 (i32.const 0)) (local.set $pair0_e1 (i32.const 1))
              )
            )
            ;; Case 12: [[1,3]]
            (if (i32.eq (local.get $caseIndex) (i32.const 12))
              (then
                (local.set $pair0_e0 (i32.const 1)) (local.set $pair0_e1 (i32.const 3))
              )
            )
            ;; Case 13: [[1,2]]
            (if (i32.eq (local.get $caseIndex) (i32.const 13))
              (then
                (local.set $pair0_e0 (i32.const 1)) (local.set $pair0_e1 (i32.const 2))
              )
            )
            ;; Case 14: [[2,3]]
            (if (i32.eq (local.get $caseIndex) (i32.const 14))
              (then
                (local.set $pair0_e0 (i32.const 2)) (local.set $pair0_e1 (i32.const 3))
              )
            )

            ;; Emit segments for pair 0
            (local.set $seg_off (i32.add (local.get $seg_ptr)
              (i32.shl (local.get $seg_count) (i32.const 4)) ;; seg_count * 16 bytes (4 floats)
            ))

            ;; Write point 0 at seg_off
            (call $get_edge_point
              (local.get $grid_ptr) (local.get $cols)
              (local.get $origin_x) (local.get $origin_y) (local.get $cell_size)
              (local.get $r) (local.get $c)
              (local.get $pair0_e0) (local.get $threshold)
              (local.get $seg_off)
            )
            ;; Write point 1 at seg_off + 8
            (call $get_edge_point
              (local.get $grid_ptr) (local.get $cols)
              (local.get $origin_x) (local.get $origin_y) (local.get $cell_size)
              (local.get $r) (local.get $c)
              (local.get $pair0_e1) (local.get $threshold)
              (i32.add (local.get $seg_off) (i32.const 8))
            )
            (local.set $seg_count (i32.add (local.get $seg_count) (i32.const 1)))

            ;; Emit pair 1 if present (saddle cases)
            (if (i32.eq (local.get $num_pairs) (i32.const 2))
              (then
                (local.set $seg_off (i32.add (local.get $seg_ptr)
                  (i32.shl (local.get $seg_count) (i32.const 4))
                ))
                (call $get_edge_point
                  (local.get $grid_ptr) (local.get $cols)
                  (local.get $origin_x) (local.get $origin_y) (local.get $cell_size)
                  (local.get $r) (local.get $c)
                  (local.get $pair1_e0) (local.get $threshold)
                  (local.get $seg_off)
                )
                (call $get_edge_point
                  (local.get $grid_ptr) (local.get $cols)
                  (local.get $origin_x) (local.get $origin_y) (local.get $cell_size)
                  (local.get $r) (local.get $c)
                  (local.get $pair1_e1) (local.get $threshold)
                  (i32.add (local.get $seg_off) (i32.const 8))
                )
                (local.set $seg_count (i32.add (local.get $seg_count) (i32.const 1)))
              )
            )

            (local.set $c (i32.add (local.get $c) (i32.const 1)))
            (br $loop_c)
          )
        )

        (local.set $r (i32.add (local.get $r) (i32.const 1)))
        (br $loop_r)
      )
    )

    (local.get $seg_count)
  )

  ;; ── get_grid_ptr: returns offset of grid region ──
  (func (export "get_grid_ptr") (result i32)
    (i32.const 0)  ;; 0x00000
  )

  ;; ── get_mst_ptr: returns offset of MST edges region ──
  (func (export "get_mst_ptr") (result i32)
    (i32.const 16384)  ;; 0x04000
  )

  ;; ── get_seg_ptr: returns offset of segments output region ──
  (func (export "get_seg_ptr") (result i32)
    (i32.const 32768)  ;; 0x08000
  )
)
