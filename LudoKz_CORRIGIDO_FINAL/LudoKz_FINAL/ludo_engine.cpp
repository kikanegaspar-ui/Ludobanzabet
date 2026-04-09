/*
 * ludo_engine.cpp  —  Motor Ludo em C++17
 *
 * Compilar (Linux/Mac):
 *   g++ -O2 -std=c++17 -shared -fPIC -o ludo_engine.so ludo_engine.cpp
 *
 * Compilar (Windows com MinGW):
 *   g++ -O2 -std=c++17 -shared -o ludo_engine.dll ludo_engine.cpp
 */

#include <cstdio>
#include <cstring>
#include <ctime>
#include <cstdint>
#include <cstdlib>

extern "C" {

/* ══════════════ CONSTANTES ══════════════ */
static const int NP    = 4;   // peças por jogador
static const int PLEN  = 52;  // caminho externo
static const int FPOS  = 58;  // posição = chegou ao fim
static const int MAX6  = 3;   // máx 6 consecutivos

/* Casas seguras (pos 1-52) */
static const int SAFE[] = {1, 9, 14, 22, 27, 35, 40, 48, -1};

/* Posição de saída no caminho global por cor (0=vermelho, 1=azul) */
static const int ENTRY[] = {1, 27};

/* ══════════════ ESTRUTURAS ══════════════ */
struct Piece { int pos; int in_base; int finished; };

struct Player {
    int    id;
    char   name[64];
    int    color;
    Piece  pieces[NP];
    int    fin_count;
};

struct LudoGame {
    Player   players[2];
    int      turn;
    int      dice;
    int      phase;       /* 0=rolar 1=mover */
    int      round;
    int      max_rounds;
    int      over;
    int      winner;
    int      can_roll;
    int      consec6;
    uint32_t seed;
};

/* ══════════════ FUNÇÕES UTILITÁRIAS ══════════════ */
static int is_safe(int pos){
    for(int i=0; SAFE[i]!=-1; i++) if(SAFE[i]==pos) return 1;
    return 0;
}

static int to_global(int color, int rel){
    if(rel<=0||rel>PLEN) return -1;
    return (ENTRY[color]+rel-2)%PLEN+1;
}

/* ══════════════ API PÚBLICA ══════════════ */

/* Aloca struct no heap — retorna ponteiro opaco */
void* ludo_create(void){
    LudoGame* g = (LudoGame*)calloc(1, sizeof(LudoGame));
    return (void*)g;
}

void ludo_destroy(void* ptr){
    free(ptr);
}

/* Inicializa jogo */
void ludo_init(void* ptr,
               int p1_id, const char* p1_name,
               int p2_id, const char* p2_name,
               int max_rounds)
{
    LudoGame* g = (LudoGame*)ptr;
    memset(g, 0, sizeof(LudoGame));

    /* seed com tempo + endereço para unicidade */
    g->seed = (uint32_t)time(nullptr) ^ (uint32_t)(uintptr_t)g;

    /* Jogador 1 — Vermelho */
    g->players[0].id    = p1_id;
    g->players[0].color = 0;
    strncpy(g->players[0].name, p1_name, 63);
    for(int i=0;i<NP;i++) g->players[0].pieces[i] = {0,1,0};

    /* Jogador 2 — Azul */
    g->players[1].id    = p2_id;
    g->players[1].color = 1;
    strncpy(g->players[1].name, p2_name, 63);
    for(int i=0;i<NP;i++) g->players[1].pieces[i] = {0,1,0};

    g->turn       = 0;
    g->max_rounds = max_rounds > 0 ? max_rounds : 80;
    g->winner     = -1;
    g->can_roll   = 1;
}

/* Lança dado → retorna 1-6, -1 se inválido */
int ludo_roll_dice(void* ptr)
{
    LudoGame* g = (LudoGame*)ptr;
    if(g->over || !g->can_roll) return -1;

    /* Xorshift32 */
    g->seed ^= g->seed << 13;
    g->seed ^= g->seed >> 17;
    g->seed ^= g->seed << 5;
    int v = (int)(g->seed % 6) + 1;

    g->dice     = v;
    g->phase    = 1;
    g->can_roll = 0;
    g->consec6  = (v==6) ? g->consec6+1 : 0;
    return v;
}

/* Tem jogadas válidas? */
int ludo_has_moves(void* ptr)
{
    LudoGame* g = (LudoGame*)ptr;
    Player*   pl = &g->players[g->turn];
    for(int i=0;i<NP;i++){
        if(pl->pieces[i].finished) continue;
        if(pl->pieces[i].in_base){ if(g->dice==6) return 1; }
        else { if(pl->pieces[i].pos + g->dice <= FPOS) return 1; }
    }
    return 0;
}

/* Peças movíveis → buf[4], retorna count */
int ludo_movable_pieces(void* ptr, int* buf)
{
    LudoGame* g  = (LudoGame*)ptr;
    Player*   pl = &g->players[g->turn];
    int cnt = 0;
    for(int i=0;i<NP;i++){
        if(pl->pieces[i].finished) continue;
        if(pl->pieces[i].in_base){ if(g->dice==6) buf[cnt++]=i; }
        else { if(pl->pieces[i].pos+g->dice<=FPOS) buf[cnt++]=i; }
    }
    return cnt;
}

/*
 * Move peça → resultado:
 *  1=OK  2=captura  3=chegou ao fim  4=VITÓRIA
 *  0=inválido  -1=erro
 */
int ludo_move_piece(void* ptr, int idx, char* msg)
{
    LudoGame* g   = (LudoGame*)ptr;
    if(g->over || g->phase!=1){ if(msg) strcpy(msg,"Fora de fase."); return -1; }
    if(idx<0||idx>=NP)         { if(msg) strcpy(msg,"Indice invalido."); return -1; }

    int     t   = g->turn;
    Player* pl  = &g->players[t];
    Player* opp = &g->players[1-t];
    Piece*  pc  = &pl->pieces[idx];

    if(pc->finished){ if(msg) strcpy(msg,"Peca ja terminou."); return 0; }

    int result = 1;

    if(pc->in_base){
        if(g->dice!=6){ if(msg) strcpy(msg,"Precisa de 6!"); return 0; }
        pc->in_base = 0;
        pc->pos     = 1;
        if(msg) snprintf(msg,255,"Peca %d saiu da base!",idx+1);
    } else {
        int np = pc->pos + g->dice;
        if(np > FPOS){ if(msg) strcpy(msg,"Ultrapassa casa final!"); return 0; }
        pc->pos = np;

        if(np == FPOS){
            pc->finished = 1;
            pl->fin_count++;
            result = 3;
            if(msg) snprintf(msg,255,"Peca %d chegou ao fim! (%d/4)",idx+1,pl->fin_count);
            if(pl->fin_count==NP){
                g->over=1; g->winner=t;
                if(msg) snprintf(msg,255,"VITORIA! %s venceu!",pl->name);
                result=4; goto next;
            }
            goto next;
        }

        /* captura no caminho externo */
        if(np<=PLEN){
            int gp = to_global(t, np);
            if(!is_safe(gp)){
                for(int i=0;i<NP;i++){
                    Piece* op = &opp->pieces[i];
                    if(op->finished||op->in_base) continue;
                    if(to_global(1-t, op->pos)==gp){
                        op->in_base=1; op->pos=0;
                        result=2;
                        if(msg) snprintf(msg,255,"Peca %d capturou peca %d de %s!",idx+1,i+1,opp->name);
                        break;
                    }
                }
            }
        }
        if(result==1&&msg) snprintf(msg,255,"Peca %d +%d (pos %d)",idx+1,g->dice,np);
    }

next:
    /* 6 e menos de MAX6 consecutivos → joga de novo */
    if(g->dice==6 && g->consec6<MAX6 && !g->over){
        g->can_roll=1; g->phase=0;
    } else {
        g->consec6=0;
        g->turn   = 1-g->turn;
        g->round++;
        g->can_roll=1; g->phase=0;
        if(!g->over && g->round>g->max_rounds){
            g->over=1;
            g->winner=(g->players[0].fin_count>=g->players[1].fin_count)?0:1;
        }
    }
    return result;
}

/* Passa a vez (sem jogadas) */
void ludo_pass_turn(void* ptr)
{
    LudoGame* g = (LudoGame*)ptr;
    g->consec6=0; g->turn=1-g->turn;
    g->round++; g->can_roll=1; g->phase=0;
    if(!g->over && g->round>g->max_rounds){
        g->over=1;
        g->winner=(g->players[0].fin_count>=g->players[1].fin_count)?0:1;
    }
}

/* Serializa para JSON (buf >= 2048) */
void ludo_to_json(void* ptr, char* buf, int sz)
{
    LudoGame* g = (LudoGame*)ptr;
    char p1[512],p2[512];

    auto pj=[](const Player& p, char* o){
        snprintf(o,511,
            "{\"id\":%d,\"name\":\"%s\",\"color\":%d,"
            "\"pos\":[%d,%d,%d,%d],"
            "\"in_base\":[%d,%d,%d,%d],"
            "\"finished\":[%d,%d,%d,%d],"
            "\"fin_count\":%d}",
            p.id,p.name,p.color,
            p.pieces[0].pos,p.pieces[1].pos,p.pieces[2].pos,p.pieces[3].pos,
            p.pieces[0].in_base,p.pieces[1].in_base,p.pieces[2].in_base,p.pieces[3].in_base,
            p.pieces[0].finished,p.pieces[1].finished,p.pieces[2].finished,p.pieces[3].finished,
            p.fin_count);
    };
    pj(g->players[0],p1);
    pj(g->players[1],p2);

    snprintf(buf,sz,
        "{\"turn\":%d,\"dice\":%d,\"phase\":%d,"
        "\"round\":%d,\"max_rounds\":%d,"
        "\"over\":%d,\"winner\":%d,"
        "\"can_roll\":%d,\"consec6\":%d,"
        "\"p1\":%s,\"p2\":%s}",
        g->turn,g->dice,g->phase,
        g->round,g->max_rounds,
        g->over,g->winner,
        g->can_roll,g->consec6,
        p1,p2);
}

int ludo_is_over(void* ptr)      { return ((LudoGame*)ptr)->over; }
int ludo_get_winner(void* ptr)   { return ((LudoGame*)ptr)->winner; }
int ludo_get_turn(void* ptr)     { return ((LudoGame*)ptr)->turn; }
int ludo_get_dice(void* ptr)     { return ((LudoGame*)ptr)->dice; }
int ludo_get_round(void* ptr)    { return ((LudoGame*)ptr)->round; }

} /* extern "C" */
