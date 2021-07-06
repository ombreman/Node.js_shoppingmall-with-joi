const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken"); // add jwt token module
const User = require("./models/user"); // user model을 참조
const Goods = require("./models/goods"); // goods model을 참조
const Cart = require("./models/cart"); // cart model을 참조
const authMiddleware = require("./middlewares/auth-middleware"); // add middleware for arthorisation

// connect mongodb
mongoose.connect("mongodb://localhost/shopping-demo", {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));

const app = express();
const router = express.Router();

// sign up API start : DB에 사용자 정보를 추가한다는 뜻과 동일
router.post("/users", async (req, res) => {
    const { nickname, email, password, confirmPassword } = req.body; // get info from client

    // validate passwrod
    if (password !== confirmPassword) { // allow login if password is correct
        res.status(400).send({ // if incorrect send 400(Bad request) error message
            errorMessage: '패스워드가 패드워드 확인란과 동일하지 않습니다.', // 
        });
        return; // code has to be done by doing return
    }

    // validate email and nickname
    const existUsers = await User.find({ // check whether nickname and email exist in DB and bring duplicated data from DB
        $or: [{ email }, { nickname }],
    });
    if (existUsers.length) { // get every info meeting conditions
        res.status(400).send({ // send error 400 message if already exist
            errorMessage: '이미 가입된 이메일 또는 닉네임이 있습니다.'
        });
        return; // finish code if error occurs
    }

    const user = new User({ email, nickname, password }); // save user in DB
    await user.save();

    res.status(201).send({}); // send success response message, code (201 means created) is suitable based on REST API rules (ref MDN docs)
});
// sign up API end

// login  API start
router.post("/auth", async (req, res) => { // 왜 POST? 입장권(token)을 그때 그때 생산한다. GET으로도 가능하지만 body에 정보를 못 싣고 주소에 치기때문에 보안에 취약
    const { email, password } = req.body; // take email and password

    const user = await User.findOne({ email, password }).exec(); // find whether there's corresponding users in DB

    if (!user) { // if no corresponding users,
        res.status(400).send({ // send an error message
            errorMessage: '이메일 또는 패스워드가 잘못됐습니다.'
        });
        return; // finish code if error occurs
    }

    const token = jwt.sign({ userId: user.userId }, "my-secret-key"); // make token (sign must be included)
    res.send({
        token,
    });
});
// login API end

// authorization middleware start
router.get("/users/me", authMiddleware, async (req, res) => { // authMiddleware 반드시 붙여줘야한다. 안그러면 res.locals 에 아무 정보도 담기지 않게 된다.
    const { user } = res.locals; // destructing (구조분해할당) >> res.locals 속의 key 값이 user에 들어간다.
    res.send({ // 필요한 정보만 골라서 client에 보내준다.
        // user => 그냥 이렇게 해도 되긴 되자만 자세히 적어주는게 best
        user: {
            email: user.email,
            nickname: user.nickname,
        } // 클라이언트에서 알아서 email 과 nickname 만 골라 가져간다. 하지만 password 노출을 피하려면 email, nickname 만 골라서 클라이언트로 넘겨준다.
    });
});
// authorization middleware end

// 숙제 start
/**
 * 내가 가진 장바구니 목록을 전부 불러온다.
 */
router.get("/goods/cart", authMiddleware, async (req, res) => {
    const { userId } = res.locals.user;

    const cart = await Cart.find({
        userId,
    }).exec();

    const goodsIds = cart.map((c) => c.goodsId);

    // 루프 줄이기 위해 Mapping 가능한 객체로 만든것
    const goodsKeyById = await Goods.find({
        _id: { $in: goodsIds },
    })
        .exec()
        .then((goods) =>
            goods.reduce(
                (prev, g) => ({
                    ...prev,
                    [g.goodsId]: g,
                }),
                {}
            )
        );

    res.send({
        cart: cart.map((c) => ({
            quantity: c.quantity,
            goods: goodsKeyById[c.goodsId],
        })),
    });
});

/**
 * 장바구니에 상품 담기.
 * 장바구니에 상품이 이미 담겨있으면 갯수만 수정한다.
 */
router.put("/goods/:goodsId/cart", authMiddleware, async (req, res) => {
    const { userId } = res.locals.user;
    const { goodsId } = req.params;
    const { quantity } = req.body;

    const existsCart = await Cart.findOne({
        userId,
        goodsId,
    }).exec();

    if (existsCart) {
        existsCart.quantity = quantity;
        await existsCart.save();
    } else {
        const cart = new Cart({
            userId,
            goodsId,
            quantity,
        });
        await cart.save();
    }

    // NOTE: 성공했을때 응답 값을 클라이언트가 사용하지 않는다.
    res.send({});
});

/**
 * 장바구니 항목 삭제
 */
router.delete("/goods/:goodsId/cart", authMiddleware, async (req, res) => {
    const { userId } = res.locals.user;
    const { goodsId } = req.params;

    const existsCart = await Cart.findOne({
        userId,
        goodsId,
    }).exec();

    // 있든 말든 신경 안쓴다. 그냥 있으면 지운다.
    if (existsCart) {
        existsCart.delete();
    }

    // NOTE: 성공했을때 딱히 정해진 응답 값이 없다.
    res.send({});
});

/**
 * 모든 상품 가져오기
 * 상품도 몇개 없는 우리에겐 페이지네이션은 사치다.
 * @example
 * /api/goods
 * /api/goods?category=drink
 * /api/goods?category=drink2
 */
router.get("/goods", authMiddleware, async (req, res) => {
    const { category } = req.query;
    const goods = await Goods.find(category ? { category } : undefined)
        .sort("-date")
        .exec();

    res.send({ goods });
});

/**
 * 상품 하나만 가져오기
 */
router.get("/goods/:goodsId", authMiddleware, async (req, res) => {
    const { goodsId } = req.params;
    const goods = await Goods.findById(goodsId).exec();

    if (!goods) {
        res.status(404).send({});
    } else {
        res.send({ goods });
    }
});

// 숙제 end

app.use("/api", express.urlencoded({ extended: false }), router);
app.use(express.static("assets")); // 프론트앤드 파일 불러오기

app.listen(8080, () => {
    console.log("서버가 요청을 받을 준비가 됐어요");
});