window.vybranyCas = null;

/* FUNKCE  */ 

function zobrazSekci(idSekce) {
    const sekce = document.querySelectorAll('.sekce');
    sekce.forEach(s => s.classList.remove('aktivni'));

    document.getElementById(idSekce).classList.add('aktivni');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prepocitejVysledek() {
    let celkovyCas = 0;
    let celkovaCena = 0;

    const zaskrtnuteSluzby = document.querySelectorAll('.sluzba-checkbox:checked');

    zaskrtnuteSluzby.forEach(sluzba => {
        celkovyCas += parseInt(sluzba.getAttribute('data-cas')) || 0;
        celkovaCena += parseInt(sluzba.getAttribute('data-cena')) || 0;
    });

    const elementCas = document.getElementById('vysledek-cas');
    const elementCena = document.getElementById('vysledek-cena');

    if (elementCas) elementCas.innerText = celkovyCas + " minut";
    if (elementCena) elementCena.innerText = celkovaCena.toLocaleString('cs-CZ') + " Kč";

    nactiDostupneCasy();
}


/* LOOKBOOK */ 

async function nactiLookbook() {
    const container = document.getElementById('seznam-sluzeb');
    if (!container) return; 

    try {
        const response = await fetch('http://localhost:3000/api/styles');
        const data = await response.json();

        container.innerHTML = ""; 

        data.forEach(styl => {
            const karta = `
                <div class="karta">
                    <img src="images/styl_${styl.styl_id}.jpg" alt="${styl.nazev}" class="karta-obrazek">
                    <div class="karta-obsah">
                        <h3>${styl.nazev}</h3>
                        <p>${styl.popis}</p>
                        <div class="detaily">
                            <span class="cena">${styl.cena} Kč</span>
                            <span class="cas">${styl.delka_trvani} min</span>
                        </div>
                        <button class="btn-objednat" onclick="location.href='rezervace.html'">Objednat se</button>
                    </div>
                </div>
            `;
            container.innerHTML += karta; 
        });

    } catch (err) {
        console.error("Chyba při načítání Lookbooku:", err);
        container.innerHTML = "Chyba při spojení se serverem.";
    }
}


/* REZERVACE */ 

async function nactiStylistyProRezervace() {
    const selectStylista = document.getElementById('vyber-stylisty');
    if (!selectStylista) return; 

    try {
        const response = await fetch('http://localhost:3000/api/stylists');
        const stylisti = await response.json();

        selectStylista.innerHTML = '<option value="">-- Vyberte kadeřníka --</option>';

        stylisti.forEach(kadernik => {
            const moznost = document.createElement('option');
            moznost.value = kadernik.stylista_id;
            moznost.textContent = `${kadernik.jmeno} ${kadernik.prijmeni}`;
            selectStylista.appendChild(moznost);
        });

    } catch (err) {
        console.error("Chyba při načítání kadeřníků:", err);
    }
}

async function nactiSluzbyProRezervace() {
    const containerSluzeb = document.getElementById('seznam-sluzeb-rezervace');
    if (!containerSluzeb) return;

    try {
        const response = await fetch('http://localhost:3000/api/styles');
        const sluzby = await response.json();

        containerSluzeb.innerHTML = "";

        sluzby.forEach(sluzba => {
            const polozkaHTML = `
                <label class="polozka-sluzby">
                    <input type="checkbox" class="sluzba-checkbox" value="${sluzba.styl_id}" data-cas="${sluzba.delka_trvani}" data-cena="${sluzba.cena}" onchange="prepocitejVysledek()">
                    <div class="nazev-sluzby">${sluzba.nazev}</div>
                    <div class="info-sluzby">${sluzba.delka_trvani} min / ${sluzba.cena} Kč</div>
                </label>
            `;
            containerSluzeb.innerHTML += polozkaHTML;
        });

    } catch (err) {
        console.error("Chyba při načítání služeb pro rezervaci:", err);
        containerSluzeb.innerHTML = "Nepodařilo se načíst nabídku služeb.";
    }
}

async function nactiDostupneCasy() {
    const selectStylista = document.getElementById('vyber-stylisty');
    const inputDatum = document.getElementById('vyber-datumu');
    const sekceCasu = document.getElementById('sekce-casu');
    const kontejnerSlotu = document.getElementById('kontejner-slotu');

    if (!selectStylista || !inputDatum || !sekceCasu || !kontejnerSlotu) return;

    const stylistId = selectStylista.value;
    const date = inputDatum.value;

    const googleCheckboxes = document.querySelectorAll('.sluzba-checkbox:checked');
    const selectedStyles = Array.from(googleCheckboxes).map(cb => parseInt(cb.value));

    if (!stylistId || !date || selectedStyles.length === 0) {
        sekceCasu.style.display = "none";
        window.vybranyCas = null;
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/check-availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ stylistId, date, selectedStyles })
        });

        const data = await response.json();

        kontejnerSlotu.innerHTML = "";
        sekceCasu.style.display = "block";

        if (data.dostupneSloty && data.dostupneSloty.length > 0) {
            data.dostupneSloty.forEach(cas => {
                const tlacitkoSlotu = document.createElement('div');
                tlacitkoSlotu.className = "casovy-slot";
                tlacitkoSlotu.innerText = cas;

                tlacitkoSlotu.onclick = function() {
                    document.querySelectorAll('.casovy-slot').forEach(el => el.classList.remove('vybrany'));
                    tlacitkoSlotu.classList.add('vybrany');
                    window.vybranyCas = cas;
                    console.log("Uživatel si zvolil čas: " + window.vybranyCas);
                };

                kontejnerSlotu.appendChild(tlacitkoSlotu);
            });
        } else {
            kontejnerSlotu.innerHTML = "<p style='color: var(--tmava-seda); grid-column: 1/-1;'>Omlouváme se, pro tyto parametry nemá kadeřník žádný volný čas.</p>";
        }

    } catch (err) {
        console.error("Chyba při komunikaci s /api/check-availability:", err);
        kontejnerSlotu.innerHTML = "Chyba při načítání rozvrhu ze serveru.";
    }
}


/* INITIALIZATION */

document.addEventListener('DOMContentLoaded', () => {
    nactiLookbook();
    nactiStylistyProRezervace();
    nactiSluzbyProRezervace();

    const selectStylista = document.getElementById('vyber-stylisty');
    const inputDatum = document.getElementById('vyber-datumu');

    if (selectStylista) selectStylista.addEventListener('change', nactiDostupneCasy);
    if (inputDatum) inputDatum.addEventListener('change', nactiDostupneCasy);
});