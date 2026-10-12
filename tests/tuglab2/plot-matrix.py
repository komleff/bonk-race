import csv
import json
import pathlib
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

out = pathlib.Path(sys.argv[1])
manifest = json.loads((out / 'configs.json').read_text())
with (out / 'standard-series.csv').open(newline='') as source:
    rows = list(csv.DictReader(source))
colors = {'coast': '#555555', 'guard': '#0072B2', 'brake': '#D55E00'}
styles = ['-', '--', ':']
groups = [(40, -1), (40, 1), (80, -1), (80, 1)]
metrics = [
    ('Side deviation |B| [m]', [('side_B_m', abs)]),
    ('B angle from initial A [deg]', [('angle_B_rad', lambda x: abs(x) * 180 / 3.141592653589793)]),
    ('Ship speeds [m/s]', [(f'{b}_speed_m_s', lambda x: x) for b in 'ABC']),
    ('Ship angular speed [deg/s]', [(f'{b}_omega_rad_s', lambda x: x * 180 / 3.141592653589793) for b in 'ABC']),
    ('B total path [m]', [('path_B_m', lambda x: x)]),
    ('B path after brake [m]', [('braking_distance_m', lambda x: x)]),
    ('Link distance / l0 [1]', [('AB_distance_m', lambda x: x), ('BC_distance_m', lambda x: x)]),
    ('Link spring force [kN]', [('AB_force_N', lambda x: x / 1000), ('BC_force_N', lambda x: x / 1000)]),
    ('C commands [fraction]', [(f'C_{v}_fraction', lambda x: x) for v in ['retro', 'lateral', 'yaw']]),
    ('Channel saturation [s]', [(f'{v}_saturation_s', lambda x: x) for v in ['retro', 'lateral', 'yaw']]),
    ('Accepted contact events [count]', [('contacts', lambda x: x)]),
    ('Minimum accepted clearance [m]', [('min_clearance_m', lambda x: x)]),
]
data = {}
for speed, mirror in groups:
    for mode in colors:
        data[speed, mirror, mode] = [r for r in rows if int(float(r['speed_m_s'])) == speed and int(r['mirror']) == mirror and r['mode'] == mode]


def values(selected, key, transform):
    if key in ['AB_distance_m', 'BC_distance_m']:
        rest = key[:2] + '_l0_m'
        return [float(r[key]) / float(r[rest]) for r in selected]
    return [transform(float(r[key])) for r in selected]


limits = []
for title, channels in metrics:
    all_values = [v for selected in data.values() for key, transform in channels for v in values(selected, key, transform)]
    low, high = min(all_values), max(all_values)
    margin = max((high-low)*.06, .05 if high == low else abs(high)*.03)
    limits.append((low-margin, high+margin))


def draw(ax, speed, mirror, index):
    title, channels = metrics[index]
    for mode, color in colors.items():
        selected = data[speed, mirror, mode]
        times = [float(r['time_s']) for r in selected]
        for channel, (key, transform) in enumerate(channels):
            ax.plot(times, values(selected, key, transform), color=color, linewidth=1.05, linestyle=styles[channel % 3], alpha=.85)
    ax.set_title(title, fontsize=8)
    ax.set_xlabel('Simulation time [s]', fontsize=8)
    ax.set_xlim(0, 60)
    ax.set_ylim(*limits[index])
    ax.grid(alpha=.2)
    ax.tick_params(labelsize=7)
    if index == 6:
        ax.axhline(.5, color='#AAAAAA', linewidth=.5)
        ax.axhline(1.5, color='#AAAAAA', linewidth=.5)


legend = [Line2D([0], [0], color=color, label=mode) for mode, color in colors.items()]
caption = f"TugLab-2 frozen standard: FA on, g=1, delay=0.25 s; source {manifest['identity']['sourceSHA'][:12]}"
if manifest['dirtyTree']:
    caption += '; dirty QA/workflow tree marked in manifest'
fig, axes = plt.subplots(4, 12, figsize=(36, 11), layout='constrained')
for row, (speed, mirror) in enumerate(groups):
    for column in range(12):
        draw(axes[row, column], speed, mirror, column)
    axes[row, 0].set_ylabel(f'{speed} m/s; mirror {mirror:+d}', fontsize=9)
fig.suptitle(caption + '\nSolid/dashed/dotted = A/B/C, AB/BC, or retro/lateral/yaw where applicable', fontsize=12)
fig.legend(handles=legend, loc='outside lower center', ncol=3)
fig.savefig(out / 'graphs.svg')
fig.savefig(out / 'graphs.png', dpi=160)
plt.close(fig)
(out / 'figures').mkdir(exist_ok=True)
for speed, mirror in groups:
    fig, axes = plt.subplots(3, 4, figsize=(16, 10), layout='constrained')
    for index, ax in enumerate(axes.flat):
        draw(ax, speed, mirror, index)
    fig.suptitle(f'{speed} m/s; mirror {mirror:+d}\n' + caption, fontsize=11)
    fig.legend(handles=legend, loc='outside lower center', ncol=3)
    name = out / 'figures' / f'standard-{speed}-mirror-{mirror:+d}'
    fig.savefig(name.with_suffix('.svg'))
    fig.savefig(name.with_suffix('.png'), dpi=180)
    plt.close(fig)
print('Saved combined graphs.svg/png and four standard group SVG/PNG figures; identical axes by metric.')
