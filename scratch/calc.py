import math

R = 8.314
# Monohydrate dehydration: CuSO4.H2O -> CuSO4 + H2O(g)
H_mono = -1084.4
H_anh = -770.4
H_g = -241.83
H_l = -285.83

dH_dec_mono = (H_anh + H_g - H_mono) * 1000 # J/mol
dH_vap = (H_g - H_l) * 1000 # J/mol

print(f"dH_dec_mono: {dH_dec_mono} J/mol")
print(f"dH_vap: {dH_vap} J/mol")

x_298 = 107.0 / (3200.0 * 2.45)
print(f"x_298: {x_298}")

def calc_mass_percent(x):
    Mw = 18.015
    Me = 46.07
    return (x * Mw) / (x * Mw + (1 - x) * Me) * 100

print(f"wt% at 298.15K (25C): {calc_mass_percent(x_298):.4f}%")

for t_c in [0, 40]:
    T = t_c + 273.15
    # x(T) = x_298 * exp( -(dH_dec_mono - dH_vap)/R * (1/T - 1/298.15) )
    x = x_298 * math.exp( -(dH_dec_mono - dH_vap)/R * (1/T - 1/298.15) )
    wt = calc_mass_percent(x)
    print(f"At {t_c} C: x = {x:.6f}, wt% = {wt:.4f}%")
