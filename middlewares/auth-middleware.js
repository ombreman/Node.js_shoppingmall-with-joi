const jwt = require("jsonwebtoken"); // call jwt module
const User = require("../models/user"); // call user module to check DB

module.exports = (req, res, next) => {
    const { authorization } = req.headers;
    const [tokenType, tokenValue] = authorization.split(' '); // 공백 기준으로 잘라서 배열로 저장해준다.

    // check weather the token is okay or not
    if (tokenType !== 'Bearer') { // token type이 bearer가 아니면 탈출시킨다.
        res.status(401).send({
            errorMessage: "로그인 후 사용하세요"
        });
        return;
    }

    try { // try 에서 error가 생기면 catch 로 넘어간다.
        const { userId } = jwt.verify(tokenValue, "my-secret-key");

        User.findById(userId).exec().then((user) => { // userId를 DB로부터 가져온다.
            res.locals.user = user; // 인증이 완료된 사용자 정보를 locals라는 공간에 담는다. >> 아주 편리함
            next(); // next를 반드시 호출해 주어야 한다.
        });
    } catch (error) { // token type 틀렸을 때와 동일
        res.status(401).send({
            errorMessage: "로그인 후 사용하세요"
        });
        return;
    }
};