# Máy chủ LazyEyes (Cloudflare, gói miễn phí)

Máy chủ cho bản chơi thử nhiều người ở Đảo Bình Minh. Phần này gồm một Cloudflare Worker nhận kết nối và một Durable Object tên `World` giữ cả đảo và các phòng Dungeon của đảo.

- **Máy chủ giữ:**
  - Quái: vị trí, máu, AI, hồi sinh, ngày và đêm.
  - Sát thương người chơi gây cho quái, EXP, tiền, cấp.
  - Túi đồ (30 ô) và trang bị (6 ô), độ bền từng món.
  - Mua bán ở Bà Mira và sửa đồ ở Thợ Rèn Bram (phải đứng gần NPC).
  - Tổ đội (tối đa 5 người) và phòng Dungeon riêng cho từng tổ đội.
  - Vào Dungeon theo tổ đội: cả tổ đội đứng trong 12 m quanh cửa hang, đội trưởng nhấn E để mở bảng Sẵn sàng, mọi người có 20 giây để bấm. Đủ người thì cả tổ đội vào cùng một lúc; một người bấm Chưa, hết giờ hoặc tổ đội đổi người thì hủy. Người vào sau không vào được, chỉ ai đã vào từ đầu mới vào lại.
  - Đồng hồ Dungeon: phải hạ Boss trong 10 phút (`limit` trong `rules.js`). Hạ Boss xong đếm ngược 10 giây rồi cả phòng tự ra trước cửa hang. Hết giờ thì cả phòng làm lại từ đầu: mọi người về đầu hang, cổng đóng, quái sinh lại. EXP, tiền và đồ rơi trong hang được giữ lại, chỉ trả khi hạ Boss; hết giờ thì mất.
- **Lưu trữ:** nhân vật lưu trong SQLite của Durable Object.
- **Chia thưởng:** EXP và tiền chia theo phần sát thương mỗi người gây ra, như GDD ghi.
  - Trong tổ đội: 70% phần của mỗi người theo sát thương, 30% gộp lại chia đều cho đồng đội còn sống trong vòng 40 m (đề xuất 07/10/2026).
  - Đồ rơi vào túi người gây nhiều sát thương nhất.
- **Chỉ số:** Tốc đánh, Chí mạng, Sát thương chí mạng và sát thương theo hệ tính từ class cộng dòng phụ trang bị (`hero` trong `rules.js`). Mỗi đòn có một hệ (`hitEl`); quái yếu hệ đó nhận ×1,5, kháng ×0,5, miễn 0 (`elMul`). Đòn không phải Vật lý bị giảm bằng Kháng phép thay vì Giáp. Công thức chung ở `dmgToMob`, máy chủ và bản chơi một mình dùng chung.
- **Thù hận:** mỗi giây quái xét lại mục tiêu. Người gây nhiều sát thương hơn mục tiêu hiện tại 10% thì kéo quái về mình. Khiêu Khích giữ quái trong thời gian hiệu lực.
- **Rơi đồ:** ngoài vũ khí, quái rơi bình máu hoặc bình mana (8% ngoài đảo, 12% trong Dungeon, Tinh Anh 60%). Boss cho thêm bình Vừa.
- **AI quái:** dùng chung với bản chơi một mình (`rules.js`, hàm `updateMob`).
  - Quái tìm đường vòng qua vật cản.
  - Đuổi 4 giây mà không lại gần được mục tiêu, hoặc bị kéo ra quá 14 m quanh chỗ cũ, thì quái quay về chỗ cũ. Trên đường về quái miễn sát thương và hồi đầy máu khi tới nơi.
- **Máy khách giữ:**
  - Di chuyển của chính mình. Máy chủ kiểm tra va chạm, và kiểm tra tốc độ bằng một "quỹ quãng đường" hồi 5 m mỗi giây, tối đa 10 m.
  - Máu của chính mình khi bị quái đánh, để việc né đúng lúc được xét theo đúng hình người chơi thấy.
  - Cách này còn cho phép gian lận máu. Cần chuyển lên máy chủ trước khi mở rộng ra ngoài đảo (đã ghi trong Câu hỏi mở của GDD).
- **Số liệu:** dùng chung file `client/data/rules.js` với bản chơi thử. Sửa số liệu ở đó thì cả hai bên cùng đổi.
- **Bản đồ:** `data/dbm.js` (Đảo Bình Minh) và `data/hhd.js` (Hang Hải Đăng Cổ), cũng dùng chung với bản chơi thử.

## Chạy thử trên máy

```bash
npm install
npm run dev
```

1. Máy chủ chạy ở `http://127.0.0.1:8787`.
   - `npm run dev` dùng `wrangler.dev.toml`: mọi trang đều tạo được nhân vật, và bật lệnh thử (đổi cấp, dịch chuyển, hạ quái) để kiểm tra tự động.
   - `wrangler.toml` (bản đưa lên Cloudflare) không bật lệnh thử.
   - Lệnh thử: `['dev', 'lv', cấp]`, `['dev', 'tien', số]`, `['dev', 'tp', x, y]`, `['dev', 'kill', tầng hoặc loại quái]`, `['dev', 'dclock', giây]` (tua đồng hồ Dungeon).
2. Mở bản chơi thử với `?server=http://127.0.0.1:8787` ở cuối địa chỉ.
3. Kiểm tra tự động: mở một cửa sổ khác và chạy `npm test`. Bài kiểm tra:
   - tạo 2 nhân vật, cho 2 người thấy nhau, đánh quái, nhận EXP;
   - mặc và tháo đồ, uống bình, thử mua đồ ở xa cửa hàng;
   - lập tổ đội, nói kênh tổ đội, thử đi quá nhanh;
   - quái quay về chỗ cũ khi bị bắn từ ngoài vùng giới hạn;
   - mua đồ phẩm Tốt (có dòng phụ); đồng đội chưa tới cửa hang thì chưa mở được, một người chưa sẵn sàng thì hủy, đủ người thì cả hai vào cùng lúc; mở cổng, đi bộ qua cổng lên tầng 2, hết 10 phút thì làm lại từ đầu, ngủ gục vì đèn, hạ Boss nhận đồ và thưởng đã tích, ra khỏi hang; đăng nhập lại.
4. Đo độ trễ và dung lượng gói tin: `node test/lag.mjs http://127.0.0.1:8787 3 12` (3 người, 12 giây).
5. Nếu chạy `npx wrangler dev` nhiều lần trên Windows, kiểm tra không còn tiến trình cũ giữ cổng 8787. Một bản cũ còn chạy sẽ trả lời thay bản mới.

## Đưa lên Cloudflare (miễn phí)

1. Chạy `npx wrangler login`. Lệnh này mở trình duyệt để bạn đăng nhập tài khoản Cloudflare.
2. Chạy `npx wrangler deploy`. Lệnh in ra địa chỉ dạng `https://lazyeyes-server.<tên-của-bạn>.workers.dev`.
3. Mở `client/data/server.js` và dán địa chỉ đó vào `window.LAZ_SERVER = '...'`.
4. Đưa thư mục `client` lên Cloudflare Pages (hoặc bất kỳ hosting tĩnh nào).
5. Kiểm tra máy chủ thật: `node test/smoke.mjs https://lazyeyes-server.<tên-của-bạn>.workers.dev`.
   - Lệnh này tạo 2 nhân vật thử tên `Thu ...` và `Ban ...`.
   - Phần Dungeon tự bỏ qua vì máy chủ thật không bật lệnh thử.
6. `ALLOWED_ORIGIN` trong `wrangler.toml` là địa chỉ trang web được phép tạo nhân vật.
7. Muốn EXP tốc độ thật thì đổi `EXP_RATE` sang `"1"`.
8. Giá đồ ở cửa hàng: `SHOP_RATE` (mặc định `"0.05"`, tức 5% giá thật) trong giai đoạn thử.

## Giới hạn gói miễn phí

Số liệu của Cloudflare, xem lại năm 2026:

- Durable Objects: 100.000 lượt mỗi ngày, 13.000 GB-giây mỗi ngày, 5 GB dữ liệu.
- Tin người chơi gửi lên: 20 tin tính là 1 lượt. Tin máy chủ gửi xuống không tính.
- Máy khách gửi tin di chuyển tối đa 5 lần mỗi giây. Khi đánh hoặc dùng kỹ năng thì gửi ngay (tối đa 20 tin mỗi giây trong lúc ra đòn). Đứng yên thì 10 giây mới gửi 1 tin.
- Tính ra một người chơi liên tục 1 giờ dùng khoảng 900–1.200 lượt. 50 người, mỗi người 2 giờ một ngày, dùng khoảng 90.000–100.000 lượt, sát mức miễn phí.
- Máy chủ chỉ gửi những quái có thay đổi, khoảng 6 KB mỗi giây mỗi người (trước là 17 KB).
- Bản đồ chỉ chạy khi có người online. Phòng Dungeon không còn ai thì dừng, sau 5 phút thì đóng.
- Khi vượt mức: gói Workers trả phí khoảng 5 USD mỗi tháng.

## Giao thức (tóm tắt)

- `POST /api/create` với `{ name, race, cls, bg, gender, outfit }`, trả về `{ id, key, char }`.
  - Máy khách lưu `id` và `key`. Mã đăng nhập là `id.key`, dùng để vào nhân vật từ máy khác.
- `GET /ws?id=..&key=..` (WebSocket):
  - Máy chủ gửi `hi` một lần, sau đó gửi `s` 10 lần mỗi giây. Gói `s` gồm:
    - `T`: đồng hồ máy chủ (mili giây).
    - `p`: mọi người chơi `[n, x, y, hướng, lật, cờ, máu %, cấp, vùng, mt]`. `mt` là lúc máy chủ nhận bước đi gần nhất, để máy khách nội suy mượt.
    - `m`: chỉ những quái mới hoặc có thay đổi trong vòng 70 m.
    - `g`: id quái đã ra khỏi tầm nhìn.
    - `zz`, `L`: thanh Buồn Ngủ và đèn của Boss khi ở trong Dungeon.
    - `tl`: số giây còn lại của Dungeon (−1 là đã hoàn thành). `ox`: số giây còn lại trước khi tự ra khỏi hang sau khi hạ Boss.
    - `e`: danh sách sự kiện.
  - Máy khách gửi `u` gồm `z` (số lần đổi bản đồ), vị trí, hướng, cờ trạng thái, máu, và danh sách sự kiện `ev`.
- Sự kiện máy khách gửi:

  | Sự kiện | Ý nghĩa |
  |---|---|
  | `['c', ô kỹ năng, xúc xắc, quái]` | dùng kỹ năng ở ô 0–2 (kèm quái đang nhắm để người khác thấy hiệu ứng). Ô nào là kỹ năng nào: `R.skillsOf(nhân vật)` |
  | `['sk', nhánh hoặc null, [mã kỹ năng ×3] hoặc null]` | chọn nhánh (Lv20, không giao tranh 5 giây) và gắn kỹ năng vào 3 ô; đổi nhánh thì ô về mặc định của nhánh; mọi lần đổi làm 3 ô hồi chiêu lại |
  | `['achq']` | hỏi tiến độ thành tựu |
  | `['h', quái, kỹ năng]` | đánh trúng hoặc gây hiệu ứng. Kỹ năng −1 là đánh thường, −2 là bộ xương triệu hồi |
  | `['ht', quái, sát thương]` | vừa mất máu vì quái này (Dơi Sương hút máu) |
  | `['pc']` | né đúng lúc |
  | `['d']` / `['r']` | gục / hồi sinh |
  | `['m', chữ, kênh]` | trò chuyện; kênh `'d'` là tổ đội |
  | `['eq', ô túi, mã đồ]` / `['uq', ô trang bị]` | mặc / tháo |
  | `['buy', mã đồ, 1 = phẩm Tốt]` / `['sell', ô túi, mã đồ]` / `['rep']` / `['use', ô túi, mã đồ]` | mua, bán, sửa, dùng bình |
  | `['pi', người]` / `['pa']` / `['pd']` / `['pq']` / `['pk', người]` | mời, nhận, từ chối, rời tổ đội, đội trưởng mời ra |
  | `['dg', 'hhd']` / `['dx']` | vào Hang Hải Đăng Cổ (đứng gần cửa hang; trong tổ đội thì đội trưởng mở bảng Sẵn sàng) / ra khỏi hang (đứng ở vòng sáng) |
  | `['ry', 1 hoặc 0]` | trả lời bảng Sẵn sàng |
  | `['ren', ô trang bị]` | rèn món đang mặc +1 (đứng gần Thợ Rèn Bram; thất bại chỉ mất tiền) |
  | `['fp', ô ruộng, mã hạt]` / `['fh', ô ruộng]` / `['ck', mã món]` | Nông Dân: trồng / thu hoạch / nấu ăn. Món ăn dùng bằng `use` (bùa lợi `I.an`) |
  | `['fa', người hoặc tên]` / `['fy', tên]` / `['fn', tên]` / `['fr', tên]` / `['fl']` / `['fv', tên]` | bạn bè: mời / đồng ý / từ chối / xóa (cả hai phía, kể cả bạn offline) / xem danh sách / xem trang bị của bạn |
  | `['tr', người]` / `['tra']` / `['trd']` | mời giao dịch (đứng trong 8 m) / nhận / từ chối |
  | `['to', [ô túi hoặc [ô túi, số lượng]...], tiền]` / `['tl', 1 hoặc 0]` / `['tk']` / `['tc']` | đặt đồ và tiền đưa ra (mở khóa cả hai bên) / khóa, mở khóa / đồng ý (cả hai đã khóa) / hủy |

- Sự kiện máy chủ gửi thêm:
  - `inv`: túi, trang bị, tiền sau mỗi thao tác.
  - `use`: bình đã dùng.
  - `loot`: đồ nhặt được.
  - `party`: danh sách tổ đội.
  - `pinv`: lời mời vào tổ đội.
  - `map`: đổi bản đồ (vào hoặc ra Dungeon).
  - `gate`: số cổng đã mở.
  - `sl`: ngủ gục vì đèn của Boss.
  - `sk` `[nhánh, ô kỹ năng]`: nhánh và 3 ô kỹ năng sau khi đổi (hoặc khi bị từ chối).
  - `ach` `[mã thành tựu]`: vừa đạt thành tựu. `achs`: toàn bộ tiến độ `{ kill, kk, clr, best, trade, done }`.
  - `oc` `[người, mã kỹ năng, quái]` / `oa` `[người, quái]`: người chơi khác dùng kỹ năng / đánh thường tầm xa, để vẽ hiệu ứng.
  - `tri` `[người, tên, cấp, class]`: lời mời giao dịch. `tw`: bảng giao dịch `{ n, name, me, them }`, mỗi bên `{ idx, it, tien, lock, ok }` (đồ chồng: `it[i].n` là số lượng đưa); `null` là đóng. Đủ hai bên đồng ý thì máy chủ kiểm tra lại (đồ còn trong túi, đủ tiền, đủ chỗ), đổi cùng lúc trên bản sao túi rồi lưu ngay; đi xa quá 12 m, đổi bản đồ hoặc thoát game thì hủy; trong lúc giao dịch không mặc, dùng, mua, bán đồ được.
  - `inv` có thêm `farm` (6 ô ruộng `{ k, at }`) và `now` (đồng hồ máy chủ để máy khách tính giờ chín).
  - Gói `s` trong Dungeon có thêm `dm`: bảng sát thương `[[tên, sát thương]]` (tối đa 1 lần/giây, chỉ khi đổi). `dmf` `[tên hang, giây, top 5]`: bảng vinh danh khi hạ Boss.
  - `fq` `[tên, cấp, class]`: lời mời kết bạn (hết hạn 60 giây). `fl`: danh sách bạn `[[tên, online, cấp, class]]`. `fv`: trang bị của bạn `{ name, cls, lv, br, eq, on, ... }`.
  - `rc`: bảng Sẵn sàng `{ ten, leader, left, m: [[người, tên, đã sẵn sàng]] }`, `null` là đóng.
- Dungeon đã clear (`c.ach.clr[mã] > 0`): quái trong hang chỉ còn 50% EXP với người đó (`R.REPEAT_EXP`).
- Máy chủ chỉ nhận một đòn trúng khi:
  - quái ở trong tầm của đòn (cộng thêm 4 m cho độ trễ mạng, cộng thân hình quái lớn),
  - kỹ năng đã hồi chiêu và đủ cấp,
  - số quái mỗi lần dùng kỹ năng đúng như tài liệu,
  - đánh thường không nhanh hơn tốc đánh của class.
