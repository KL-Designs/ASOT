// Dumps every equippable item's displayName and classification signals.
// Run in the debug console with the unit's full modlist loaded, then extract
// the ITEMDUMP block from %LOCALAPPDATA%\Arma 3\*.rpt.
private _rows = [];

private _add = {
    params ["_cfg", "_root"];
    private _cls  = configName _cfg;
    private _name = getText (_cfg >> "displayName");
    if (_name isEqualTo "") exitWith {};

    // ACE arsenal shows scopeArsenal where it is defined, which is not always scope.
    private _scope  = getNumber (_cfg >> "scope");
    private _scopeA = if (isNumber (_cfg >> "scopeArsenal")) then { getNumber (_cfg >> "scopeArsenal") } else { _scope };
    if (_scope < 2 && { _scopeA < 2 }) exitWith {};

    // The inheritance chain separates a rifle from a launcher without guessing
    // at classname spelling. Capped at 6 to keep lines short.
    private _chain = [];
    private _p = inheritsFrom _cfg;
    while { !isNull _p && { count _chain < 6 } } do {
        _chain pushBack (configName _p);
        _p = inheritsFrom _p;
    };

    private _type = getNumber (_cfg >> "ItemInfo" >> "type");
    private _mass = getNumber (_cfg >> "ItemInfo" >> "mass");
    if (_root isEqualTo "CfgMagazines") then {
        _type = -1;
        _mass = getNumber (_cfg >> "mass");
    };

    private _mod  = "";
    private _mods = configSourceModList _cfg;
    if (count _mods > 0) then { _mod = _mods select 0 };

    // Pipe-delimited with displayName last: `str` on an array emits Arma's own
    // quoting, which is a nuisance to unescape, and a stray pipe inside a name
    // is harmless when the name is the final field.
    _rows pushBack format ["ITEMDUMP|%1|%2|%3|%4|%5|%6|%7|%8",
        _cls, _root, _type, _mass, getNumber (_cfg >> "count"), _mod, _chain joinString ">", _name];
};

{ [_x, "CfgWeapons"]   call _add } forEach ("true" configClasses (configFile >> "CfgWeapons"));
{ [_x, "CfgMagazines"] call _add } forEach ("true" configClasses (configFile >> "CfgMagazines"));
{ [_x, "CfgGlasses"]   call _add } forEach ("true" configClasses (configFile >> "CfgGlasses"));
{ [_x, "CfgVehicles"]  call _add } forEach ("configName _x isKindOf 'Bag_Base'" configClasses (configFile >> "CfgVehicles"));

diag_log "=== ITEMDUMP BEGIN ===";
{ diag_log _x } forEach _rows;
diag_log format ["=== ITEMDUMP END (%1 entries) ===", count _rows];
